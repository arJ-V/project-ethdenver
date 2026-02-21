from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Query, status
from fastapi.responses import StreamingResponse
from fastapi import HTTPException
from pydantic import BaseModel

from db import get_pool
from live import stream_events
from pricing import _establishment_price_cents
from settings import DEMO_RESET_SECRET, RWA_TOKEN_AMOUNT_MINTED

router = APIRouter(prefix="/api", tags=["api"])


class CreateRWAInput(BaseModel):
    kwh: int


@router.post("/rwa", status_code=status.HTTP_201_CREATED)
async def create_rwa(body: CreateRWAInput) -> dict:
    """
    Create an RWA. Input: starting KWH. Output: RWA ADI ID.
    Creates the initial time-series row (starting KWH, computed starting price in cents).
    """
    if body.kwh < 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="kwh must be non-negative")
    starting_price_cents = _establishment_price_cents(body.kwh, RWA_TOKEN_AMOUNT_MINTED)
    pool = await get_pool()
    row = await pool.fetchrow(
        """
        INSERT INTO rwas (starting_kwh, starting_price_cents)
        VALUES ($1, $2)
        RETURNING id, created_at, starting_kwh, starting_price_cents
        """,
        body.kwh,
        starting_price_cents,
    )
    rwa_id = int(row["id"])
    await pool.execute(
        """
        INSERT INTO rwa_timeseries (rwa_id, ts, kwh, price_cents)
        VALUES ($1, $2, $3, $4)
        """,
        rwa_id,
        row["created_at"],
        body.kwh,
        starting_price_cents,
    )
    return {"rwa_adi_id": rwa_id}


@router.get("/rwa/{rwa_id}/data")
async def get_rwa_data(
    rwa_id: int,
    from_ts: str = Query(..., alias="from"),
    to_ts: str = Query(..., alias="to"),
    limit: int = Query(10000, le=50000),
) -> list:
    """Time-series data of KWH and price for the RWA in the given time range."""
    try:
        from_dt = datetime.fromisoformat(from_ts.replace("Z", "+00:00"))
        to_dt = datetime.fromisoformat(to_ts.replace("Z", "+00:00"))
    except ValueError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid from/to datetime")
    pool = await get_pool()
    rows = await pool.fetch(
        """
        SELECT ts, kwh, price_cents
        FROM rwa_timeseries
        WHERE rwa_id = $1 AND ts >= $2 AND ts <= $3
        ORDER BY ts ASC
        LIMIT $4
        """,
        rwa_id,
        from_dt,
        to_dt,
        limit,
    )
    return [
        {
            "ts": r["ts"].isoformat() if hasattr(r["ts"], "isoformat") else str(r["ts"]),
            "kwh": int(r["kwh"]),
            "price_cents": int(r["price_cents"]),
        }
        for r in rows
    ]


@router.get("/rwa/{rwa_id}/latest")
async def get_rwa_latest(rwa_id: int) -> dict:
    """Latest time, KWH, and price for the RWA (redundant with last point of Get RWA data)."""
    pool = await get_pool()
    row = await pool.fetchrow(
        """
        SELECT ts, kwh, price_cents
        FROM rwa_timeseries
        WHERE rwa_id = $1
        ORDER BY ts DESC
        LIMIT 1
        """,
        rwa_id,
    )
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="RWA not found or no data")
    return {
        "ts": row["ts"].isoformat() if hasattr(row["ts"], "isoformat") else str(row["ts"]),
        "kwh": int(row["kwh"]),
        "price_cents": int(row["price_cents"]),
    }


@router.get("/rwas")
async def list_rwas() -> list:
    """List all RWAs with their latest KWH and ts (for publisher)."""
    pool = await get_pool()
    rows = await pool.fetch(
        """
        SELECT r.id AS rwa_id,
               (SELECT kwh FROM rwa_timeseries WHERE rwa_id = r.id ORDER BY ts DESC LIMIT 1) AS latest_kwh,
               (SELECT ts FROM rwa_timeseries WHERE rwa_id = r.id ORDER BY ts DESC LIMIT 1) AS latest_ts
        FROM rwas r
        ORDER BY r.id
        """
    )
    return [
        {
            "rwa_adi_id": int(r["rwa_id"]),
            "latest_kwh": int(r["latest_kwh"]) if r["latest_kwh"] is not None else None,
            "latest_ts": r["latest_ts"].isoformat() if r["latest_ts"] and hasattr(r["latest_ts"], "isoformat") else str(r["latest_ts"]) if r["latest_ts"] else None,
        }
        for r in rows
    ]


@router.get("/history")
async def history(
    site_id: int = Query(1),
    from_ts: str = Query(..., alias="from"),
    to_ts: str = Query(..., alias="to"),
    limit: int = Query(10000, le=50000),
) -> list:
    try:
        from_dt = datetime.fromisoformat(from_ts.replace("Z", "+00:00"))
        to_dt = datetime.fromisoformat(to_ts.replace("Z", "+00:00"))
    except ValueError:
        return []
    pool = await get_pool()
    rows = await pool.fetch(
        """
        SELECT site_id, ts, watt_hours, battery_soc, tx_hash, block_number, log_index, asset_price_cents
        FROM telemetry_points
        WHERE site_id = $1 AND ts >= $2 AND ts <= $3
        ORDER BY ts ASC
        LIMIT $4
        """,
        site_id,
        from_dt,
        to_dt,
        limit,
    )
    return [
        {
            "site_id": r["site_id"],
            "ts": r["ts"].isoformat() if hasattr(r["ts"], "isoformat") else str(r["ts"]),
            "watt_hours": r["watt_hours"],
            "battery_soc": r["battery_soc"],
            "tx_hash": r["tx_hash"],
            "block_number": r["block_number"],
            "log_index": r["log_index"],
            "asset_price_cents": int(r["asset_price_cents"]) if r.get("asset_price_cents") is not None else None,
        }
        for r in rows
    ]


@router.get("/price")
async def price(site_id: int = Query(1)) -> dict:
    """Current RWA asset price for the site in cents (integer). Checks telemetry_points, rwa_site_state, then rwa_timeseries."""
    pool = await get_pool()
    row = await pool.fetchrow(
        """
        SELECT asset_price_cents FROM telemetry_points
        WHERE site_id = $1 AND asset_price_cents IS NOT NULL
        ORDER BY ts DESC LIMIT 1
        """,
        site_id,
    )
    if row is not None:
        return {"site_id": site_id, "asset_price_cents": int(row["asset_price_cents"])}
    state = await pool.fetchrow(
        "SELECT current_price_cents FROM rwa_site_state WHERE site_id = $1", site_id
    )
    if state is not None:
        return {"site_id": site_id, "asset_price_cents": int(state["current_price_cents"])}
    rwa_row = await pool.fetchrow(
        "SELECT price_cents FROM rwa_timeseries WHERE rwa_id = $1 ORDER BY ts DESC LIMIT 1",
        site_id,
    )
    if rwa_row is not None:
        return {"site_id": site_id, "asset_price_cents": int(rwa_row["price_cents"])}
    return {"site_id": site_id, "asset_price_cents": None}


@router.get("/live")
async def live(
    site_id: int = Query(1),
    last: bool = Query(True, description="Send last known point on connect"),
):
    return StreamingResponse(
        stream_events(site_id, send_last=last),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no"},
    )


@router.post("/reset", status_code=status.HTTP_204_NO_CONTENT)
async def reset(
    secret: Optional[str] = Query(None),
    authorization: Optional[str] = None,
):
    if not DEMO_RESET_SECRET:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Reset not enabled")
    token = secret
    if not token and authorization and authorization.startswith("Bearer "):
        token = authorization[7:].strip()
    if not token or token != DEMO_RESET_SECRET:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid secret")
    pool = await get_pool()
    await pool.execute("TRUNCATE TABLE telemetry_points")
    await pool.execute("TRUNCATE TABLE rwa_site_state")
    await pool.execute("TRUNCATE TABLE rwa_timeseries")
    await pool.execute("TRUNCATE TABLE rwas")
    return None


@router.get("/health")
async def health() -> dict:
    try:
        pool = await get_pool()
        await pool.fetchval("SELECT 1")
        return {"status": "ok", "db": "connected"}
    except Exception as e:
        return {"status": "error", "db": str(e)}
