import json
from datetime import datetime, timezone
from typing import Any, Callable, List

from db import get_pool
from models import StreamsEvent
from live import get_pubsub

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
    for ev in events:
        row = _event_to_row(ev)
        try:
            r = await pool.fetchrow(
                """
                INSERT INTO telemetry_points (site_id, ts, watt_hours, battery_soc, tx_hash, block_number, log_index)
                VALUES ($1, $2, $3, $4, $5, $6, $7)
                ON CONFLICT (tx_hash, log_index) DO NOTHING
                RETURNING site_id, ts, watt_hours, battery_soc, tx_hash, block_number, log_index
                """,
                *row,
            )
            if r is not None:
                inserted += 1
                payload = {
                    "site_id": r["site_id"],
                    "ts": r["ts"].isoformat() if hasattr(r["ts"], "isoformat") else str(r["ts"]),
                    "watt_hours": r["watt_hours"],
                    "battery_soc": r["battery_soc"],
                    "tx_hash": r["tx_hash"],
                    "block_number": r["block_number"],
                    "log_index": r["log_index"],
                }
                PUBSUB_NOTIFY(ev.site_id, payload)
        except Exception:
            pass
    return inserted, len(events)
