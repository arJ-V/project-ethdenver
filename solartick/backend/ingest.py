import json
import logging
from datetime import datetime, timezone
from typing import Any, Callable, List

import asyncpg
from db import get_pool
from live import get_pubsub
from models import StreamsEvent
from pricing import get_or_update_site_price_cents, compute_rwa_next_price_cents

PUBSUB_NOTIFY: Callable[[int, dict], None] = lambda site_id, row: None


def set_pubsub_notify(fn: Callable[[int, dict], None]) -> None:
    global PUBSUB_NOTIFY
    PUBSUB_NOTIFY = fn


def _parse_event(raw: Any) -> StreamsEvent | None:
    try:
        if isinstance(raw, dict):
            o = raw
        else:
            o = json.loads(raw) if isinstance(raw, str) else None
        if not o:
            return None
        ts = o.get("ts")
        if isinstance(ts, int):
            ts_val = ts
        else:
            ts_val = int(ts) if ts else 0
        return StreamsEvent(
            site_id=int(o["site_id"]),
            ts=ts_val,
            watt_hours=int(o["watt_hours"]),
            battery_soc=float(o["battery_soc"]),
            tx_hash=str(o["tx_hash"]),
            block_number=int(o["block_number"]),
            log_index=int(o["log_index"]),
        )
    except (KeyError, TypeError, ValueError):
        return None


def _event_to_row(ev: StreamsEvent) -> tuple:
    dt = datetime.fromtimestamp(ev.ts, tz=timezone.utc)
    return (
        ev.site_id,
        dt,
        ev.watt_hours,
        ev.battery_soc,
        ev.tx_hash,
        ev.block_number,
        ev.log_index,
    )


async def ingest_events(body: bytes) -> tuple[int, int]:
    """Parse body (single event or array), insert into DB, notify pubsub. Returns (inserted_count, total_parsed)."""
    try:
        data = json.loads(body)
    except json.JSONDecodeError:
        return 0, 0
    events: List[StreamsEvent] = []
    if isinstance(data, list):
        for item in data:
            ev = _parse_event(item)
            if ev:
                events.append(ev)
    else:
        ev = _parse_event(data)
        if ev:
            events.append(ev)
    if not events:
        return 0, 0

    pool = await get_pool()
    inserted = 0
    last_price_cents: int | None = None
    last_oracle_rwa_id: int | None = None
    last_oracle_kwh: int | None = None
    last_oracle_tx_hash: str | None = None
    last_oracle_log_index: int | None = None
    async with pool.acquire() as conn:
        for ev in events:
            rwa_id = ev.site_id
            new_kwh = ev.watt_hours
            ts_dt = _event_to_row(ev)[1]

            # Check if this site_id is an RWA (created via Create RWA API)
            is_rwa = await conn.fetchval("SELECT 1 FROM rwas WHERE id = $1", rwa_id)

            if is_rwa:
                # RWA path: get latest KWH/price, compute new price, append to rwa_timeseries, push to oracle
                latest = await conn.fetchrow(
                    """
                    SELECT kwh, price_cents FROM rwa_timeseries
                    WHERE rwa_id = $1 ORDER BY ts DESC LIMIT 1
                    """,
                    rwa_id,
                )
                if latest is None:
                    continue
                latest_kwh = int(latest["kwh"])
                latest_price_cents = int(latest["price_cents"])
                new_price_cents = compute_rwa_next_price_cents(latest_kwh, latest_price_cents, new_kwh)
                try:
                    await conn.execute(
                        """
                        INSERT INTO rwa_timeseries (rwa_id, ts, kwh, price_cents, tx_hash, log_index)
                        VALUES ($1, $2, $3, $4, $5, $6)
                        """,
                        rwa_id,
                        ts_dt,
                        new_kwh,
                        new_price_cents,
                        ev.tx_hash or None,
                        ev.log_index,
                    )
                    inserted += 1
                    last_price_cents = new_price_cents
                    last_oracle_rwa_id = rwa_id
                    last_oracle_kwh = new_kwh
                    last_oracle_tx_hash = ev.tx_hash or None
                    last_oracle_log_index = ev.log_index
                    payload = {
                        "site_id": rwa_id,
                        "ts": ts_dt.isoformat() if hasattr(ts_dt, "isoformat") else str(ts_dt),
                        "watt_hours": new_kwh,
                        "kwh": new_kwh,
                        "asset_price_cents": new_price_cents,
                    }
                    PUBSUB_NOTIFY(rwa_id, payload)
                except asyncpg.UniqueViolationError:
                    pass  # already ingested (same tx_hash, log_index)
            else:
                # Legacy path: telemetry_points + rwa_site_state + oracle
                row = _event_to_row(ev)
                try:
                    asset_price_cents = await get_or_update_site_price_cents(conn, ev.site_id, ev.watt_hours)
                    r = await conn.fetchrow(
                        """
                        INSERT INTO telemetry_points (site_id, ts, watt_hours, battery_soc, tx_hash, block_number, log_index, asset_price_cents)
                        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                        ON CONFLICT (tx_hash, log_index) DO NOTHING
                        RETURNING site_id, ts, watt_hours, battery_soc, tx_hash, block_number, log_index, asset_price_cents
                        """,
                        row[0],
                        row[1],
                        row[2],
                        row[3],
                        row[4],
                        row[5],
                        row[6],
                        asset_price_cents,
                    )
                    if r is not None:
                        inserted += 1
                        last_price_cents = asset_price_cents
                        payload = {
                            "site_id": r["site_id"],
                            "ts": r["ts"].isoformat() if hasattr(r["ts"], "isoformat") else str(r["ts"]),
                            "watt_hours": r["watt_hours"],
                            "battery_soc": r["battery_soc"],
                            "tx_hash": r["tx_hash"],
                            "block_number": r["block_number"],
                            "log_index": r["log_index"],
                            "asset_price_cents": int(r["asset_price_cents"]) if r.get("asset_price_cents") is not None else None,
                        }
                        PUBSUB_NOTIFY(ev.site_id, payload)
                except Exception:
                    pass

        # Enqueue price (cents) for relayer to push to Hedera oracle. Contract rejects 0 so we only enqueue when > 0.
        if inserted > 0 and last_price_cents is not None and last_price_cents > 0:
            await conn.execute(
                "INSERT INTO oracle_pending_updates (yield_index) VALUES ($1)",
                last_price_cents,
            )
            if last_oracle_rwa_id is not None and last_oracle_kwh is not None:
                await conn.execute(
                    """
                    INSERT INTO rwa_oracle_updates (rwa_id, price_cents, kwh, source_tx_hash, source_log_index)
                    VALUES ($1, $2, $3, $4, $5)
                    """,
                    last_oracle_rwa_id,
                    last_price_cents,
                    last_oracle_kwh,
                    last_oracle_tx_hash,
                    last_oracle_log_index,
                )
            logging.getLogger(__name__).info(
                "oracle_pending_enqueue price_cents=%s (inserted=%s)",
                last_price_cents,
                inserted,
            )

    return inserted, len(events)
