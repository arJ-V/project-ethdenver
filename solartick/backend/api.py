from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Query, status
from fastapi.responses import StreamingResponse
from fastapi import HTTPException

from db import get_pool
from live import stream_events
from settings import DEMO_RESET_SECRET

router = APIRouter(prefix="/api", tags=["api"])


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
        SELECT site_id, ts, watt_hours, battery_soc, tx_hash, block_number, log_index
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
        }
        for r in rows
    ]


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
    return None


@router.get("/health")
async def health() -> dict:
    try:
        pool = await get_pool()
        await pool.fetchval("SELECT 1")
        return {"status": "ok", "db": "connected"}
    except Exception as e:
        return {"status": "error", "db": str(e)}
