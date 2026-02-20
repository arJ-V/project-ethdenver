import asyncio
import json
from typing import AsyncGenerator, Dict, Set

from db import get_pool

# In-memory pubsub: site_id -> set of queues (each queue is a list we append to)
_subscribers: Dict[int, Set[asyncio.Queue]] = {}
_lock = asyncio.Lock()


def get_pubsub() -> object:
    return _subscribers


async def subscribe(site_id: int) -> asyncio.Queue:
    async with _lock:
        if site_id not in _subscribers:
            _subscribers[site_id] = set()
        q: asyncio.Queue = asyncio.Queue()
        _subscribers[site_id].add(q)
    return q


async def unsubscribe(site_id: int, q: asyncio.Queue) -> None:
    async with _lock:
        if site_id in _subscribers:
            _subscribers[site_id].discard(q)
            if not _subscribers[site_id]:
                del _subscribers[site_id]


def publish(site_id: int, payload: dict) -> None:
    for q in _subscribers.get(site_id, set()):
        try:
            q.put_nowait(payload)
        except asyncio.QueueFull:
            pass


async def stream_events(site_id: int, send_last: bool) -> AsyncGenerator[str, None]:
    q = await subscribe(site_id)
    try:
        yield "data: {\"event\":\"connected\",\"site_id\":%d}\n\n" % site_id
        if send_last:
            pool = await get_pool()
            row = await pool.fetchrow(
                """
                SELECT site_id, ts, watt_hours, battery_soc, tx_hash, block_number, log_index
                FROM telemetry_points WHERE site_id = $1 ORDER BY ts DESC LIMIT 1
                """,
                site_id,
            )
            if row:
                payload = {
                    "site_id": row["site_id"],
                    "ts": row["ts"].isoformat() if hasattr(row["ts"], "isoformat") else str(row["ts"]),
                    "watt_hours": row["watt_hours"],
                    "battery_soc": row["battery_soc"],
                    "tx_hash": row["tx_hash"],
                    "block_number": row["block_number"],
                    "log_index": row["log_index"],
                }
                yield f"data: {json.dumps(payload)}\n\n"
        while True:
            payload = await q.get()
            yield f"data: {json.dumps(payload)}\n\n"
    finally:
        await unsubscribe(site_id, q)
