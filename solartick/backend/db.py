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
            asset_price_cents BIGINT NULL,
            PRIMARY KEY (tx_hash, log_index)
        );
    """)
    await pool.execute("""
        ALTER TABLE telemetry_points ADD COLUMN IF NOT EXISTS asset_price_cents BIGINT NULL;
    """)
    await pool.execute("""
        CREATE INDEX IF NOT EXISTS idx_telemetry_site_ts
        ON telemetry_points (site_id, ts DESC);
    """)
    await pool.execute("""
        CREATE TABLE IF NOT EXISTS rwa_site_state (
            site_id BIGINT PRIMARY KEY,
            initial_yield BIGINT NOT NULL,
            token_amount_minted BIGINT NOT NULL,
            previous_yield BIGINT NOT NULL,
            current_price_cents BIGINT NOT NULL,
            established_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
    """)
    await pool.execute("""
        ALTER TABLE rwa_site_state ADD COLUMN IF NOT EXISTS current_price_cents BIGINT NULL;
    """)
    await pool.execute("""
        CREATE TABLE IF NOT EXISTS rwas (
            id BIGSERIAL PRIMARY KEY,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            starting_kwh BIGINT NOT NULL,
            starting_price_cents BIGINT NOT NULL
        );
    """)
    await pool.execute("""
        CREATE TABLE IF NOT EXISTS rwa_timeseries (
            id BIGSERIAL PRIMARY KEY,
            rwa_id BIGINT NOT NULL REFERENCES rwas(id) ON DELETE CASCADE,
            ts TIMESTAMPTZ NOT NULL,
            kwh BIGINT NOT NULL,
            price_cents BIGINT NOT NULL,
            tx_hash TEXT NULL,
            log_index INT NULL
        );
    """)
    await pool.execute("""
        CREATE INDEX IF NOT EXISTS idx_rwa_timeseries_rwa_ts
        ON rwa_timeseries (rwa_id, ts DESC);
    """)
    await pool.execute("""
        CREATE UNIQUE INDEX IF NOT EXISTS idx_rwa_timeseries_dedup
        ON rwa_timeseries (tx_hash, log_index) WHERE tx_hash IS NOT NULL AND log_index IS NOT NULL;
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
