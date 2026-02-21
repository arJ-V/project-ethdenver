import asyncpg
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from settings import DATABASE_URL

_pool: asyncpg.Pool | None = None


async def get_pool() -> asyncpg.Pool:
    global _pool
    if _pool is None:
        _pool = await asyncpg.create_pool(DATABASE_URL, min_size=1, max_size=10, command_timeout=60)
    return _pool


async def close_pool() -> None:
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None


async def init_db(pool: asyncpg.Pool) -> None:
    await pool.execute("""
        CREATE TABLE IF NOT EXISTS telemetry_points (
            site_id BIGINT NOT NULL,
            ts TIMESTAMPTZ NOT NULL,
            watt_hours BIGINT NOT NULL,
            battery_soc REAL NULL,
            tx_hash TEXT NOT NULL,
            block_number BIGINT NOT NULL,
            log_index INT NOT NULL,
            PRIMARY KEY (tx_hash, log_index)
        );
    """)
    await pool.execute("""
        CREATE INDEX IF NOT EXISTS idx_telemetry_site_ts
        ON telemetry_points (site_id, ts DESC);
    """)
    await pool.execute("""
        CREATE TABLE IF NOT EXISTS oracle_pending_updates (
            id BIGSERIAL PRIMARY KEY,
            yield_index BIGINT NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
    """)
    await pool.execute("""
        CREATE INDEX IF NOT EXISTS idx_oracle_pending_created
        ON oracle_pending_updates (created_at);
    """)


@asynccontextmanager
async def get_conn() -> AsyncGenerator[asyncpg.Connection, None]:
    pool = await get_pool()
    async with pool.acquire() as conn:
        yield conn
