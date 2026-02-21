import asyncio
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Body, Query, status
from fastapi.responses import StreamingResponse
from fastapi import HTTPException
from pydantic import BaseModel

from adi import bootstrap_rwa_on_adi, operator_address_from_key
from db import get_pool
from live import stream_events
from pricing import _establishment_price_cents
from settings import (
    ADI_OPERATOR_PRIVATE_KEY,
    ADI_RPC_URL,
    ADI_VAULT_ADDRESS,
    DEMO_RESET_SECRET,
    RWA_DEFAULT_BENEFICIARY,
    RWA_TOKEN_AMOUNT_MINTED,
)

router = APIRouter(prefix="/api", tags=["api"])


@router.get("/config")
async def get_config() -> dict:
    """Public config for frontend (e.g. ADI Vault address for display)."""
    return {"adi_vault_address": ADI_VAULT_ADDRESS}


class CreateRWAInput(BaseModel):
    kwh: int
    bootstrap: Optional[bool] = True  # when True, run ADI mint+lock after insert
    beneficiary: Optional[str] = None  # used when bootstrap is True


class BootstrapRWAInput(BaseModel):
    kwh: int
    beneficiary: Optional[str] = None


async def _rwa_creation_in_progress(pool, exclude_rwa_id: Optional[int] = None) -> bool:
    """True if any RWA (other than exclude_rwa_id) is created-but-not-locked or locked-but-hedera-mint-pending."""
    if exclude_rwa_id is not None:
        row = await pool.fetchrow(
            """
            SELECT 1 FROM rwas
            WHERE id != $1
              AND (bootstrap_status = 'created'
                   OR (bootstrap_status = 'locked' AND (hedera_mint_status IS NULL OR hedera_mint_status = 'pending')))
            LIMIT 1
            """,
            exclude_rwa_id,
        )
    else:
        row = await pool.fetchrow(
            """
            SELECT 1 FROM rwas
            WHERE bootstrap_status = 'created'
               OR (bootstrap_status = 'locked' AND (hedera_mint_status IS NULL OR hedera_mint_status = 'pending'))
            LIMIT 1
            """
        )
    return row is not None


async def _insert_rwa_row(kwh: int) -> dict:
    if kwh <= 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="kwh must be positive")
    pool = await get_pool()
    if await _rwa_creation_in_progress(pool):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Another RWA is currently in creation (Postgres created, ADI bootstrap, or Hedera mint). Finish or wait before creating a new one.",
        )
    starting_price_cents = _establishment_price_cents(kwh, RWA_TOKEN_AMOUNT_MINTED)
    row = await pool.fetchrow(
        """
        INSERT INTO rwas (starting_kwh, starting_price_cents, bootstrap_status)
        VALUES ($1, $2, $3)
        RETURNING id, created_at, starting_kwh, starting_price_cents
        """,
        kwh,
        starting_price_cents,
        "created",
    )
    rwa_id = int(row["id"])
    await pool.execute(
        """
        INSERT INTO rwa_timeseries (rwa_id, ts, kwh, price_cents)
        VALUES ($1, $2, $3, $4)
        """,
        rwa_id,
        row["created_at"],
        kwh,
        starting_price_cents,
    )
    return {
        "rwa_adi_id": rwa_id,
        "created_at": row["created_at"].isoformat() if hasattr(row["created_at"], "isoformat") else str(row["created_at"]),
        "starting_kwh": int(row["starting_kwh"]),
        "starting_price_cents": int(row["starting_price_cents"]),
    }


@router.post("/rwa", status_code=status.HTTP_201_CREATED)
async def create_rwa(body: CreateRWAInput) -> dict:
    """
    Create an RWA. Input: starting KWH; optional bootstrap (default True) runs ADI mint+lock.
    When bootstrap=True, returns asset_id and tx hashes; when False, returns only rwa_adi_id.
    """
    created = await _insert_rwa_row(body.kwh)
    rwa_id = int(created["rwa_adi_id"])

    if body.bootstrap is False:
        return {"rwa_adi_id": rwa_id}

    # Bootstrap on ADI (same flow as POST /rwa/bootstrap)
    beneficiary = body.beneficiary or RWA_DEFAULT_BENEFICIARY
    if not ADI_RPC_URL or not ADI_VAULT_ADDRESS or not ADI_OPERATOR_PRIVATE_KEY:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="ADI not configured (ADI_RPC_URL, ADI_VAULT_ADDRESS, ADI_OPERATOR_PRIVATE_KEY required for bootstrap)",
        )
    # Fallback: when no beneficiary is set, use the operator address (e.g. for local/demo)
    if not beneficiary:
        beneficiary = operator_address_from_key(ADI_OPERATOR_PRIVATE_KEY)

    try:
        adi_result = await asyncio.to_thread(
            bootstrap_rwa_on_adi,
            adi_rpc_url=ADI_RPC_URL,
            vault_address=ADI_VAULT_ADDRESS,
            operator_private_key=ADI_OPERATOR_PRIVATE_KEY,
            beneficiary=beneficiary,
            expected_yield_kwh=body.kwh,
        )
    except Exception as exc:
        pool = await get_pool()
        await pool.execute(
            "UPDATE rwas SET bootstrap_status = $2, beneficiary_address = $3 WHERE id = $1",
            rwa_id,
            "failed",
            beneficiary,
        )
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"ADI bootstrap failed: {exc}") from exc

    pool = await get_pool()
    await pool.execute(
        """
        UPDATE rwas
        SET adi_asset_id = $2,
            adi_owner_address = $3,
            beneficiary_address = $4,
            mint_tx_hash = $5,
            lock_tx_hash = $6,
            bootstrap_status = $7,
            hedera_mint_status = $8
        WHERE id = $1
        """,
        rwa_id,
        adi_result.asset_id,
        adi_result.owner,
        beneficiary,
        adi_result.mint_tx_hash,
        adi_result.lock_tx_hash,
        "locked",
        "pending",
    )
    return {
        "rwa_adi_id": rwa_id,
        "asset_id": adi_result.asset_id,
        "beneficiary": beneficiary,
        "mint_tx_hash": adi_result.mint_tx_hash,
        "lock_tx_hash": adi_result.lock_tx_hash,
        "status": "locked",
    }


@router.post("/rwa/bootstrap", status_code=status.HTTP_201_CREATED)
async def bootstrap_rwa(body: BootstrapRWAInput) -> dict:
    """
    Create an RWA and immediately mint+lock its matching ADI asset.
    This emits YieldMintRequested, which the relayer consumes to mint ySOLAR.
    """
    beneficiary = body.beneficiary or RWA_DEFAULT_BENEFICIARY
    if not ADI_RPC_URL or not ADI_VAULT_ADDRESS or not ADI_OPERATOR_PRIVATE_KEY:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Missing ADI config (ADI_RPC_URL, ADI_VAULT_ADDRESS, ADI_OPERATOR_PRIVATE_KEY)",
        )
    if not beneficiary:
        beneficiary = operator_address_from_key(ADI_OPERATOR_PRIVATE_KEY)
    created = await _insert_rwa_row(body.kwh)
    rwa_id = int(created["rwa_adi_id"])

    try:
        adi_result = await asyncio.to_thread(
            bootstrap_rwa_on_adi,
            adi_rpc_url=ADI_RPC_URL,
            vault_address=ADI_VAULT_ADDRESS,
            operator_private_key=ADI_OPERATOR_PRIVATE_KEY,
            beneficiary=beneficiary,
            expected_yield_kwh=body.kwh,
        )
    except Exception as exc:
        pool = await get_pool()
        await pool.execute(
            "UPDATE rwas SET bootstrap_status = $2, beneficiary_address = $3 WHERE id = $1",
            rwa_id,
            "failed",
            beneficiary,
        )
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"ADI bootstrap failed: {exc}") from exc

    pool = await get_pool()
    await pool.execute(
        """
        UPDATE rwas
        SET adi_asset_id = $2,
            adi_owner_address = $3,
            beneficiary_address = $4,
            mint_tx_hash = $5,
            lock_tx_hash = $6,
            bootstrap_status = $7,
            hedera_mint_status = $8
        WHERE id = $1
        """,
        rwa_id,
        adi_result.asset_id,
        adi_result.owner,
        beneficiary,
        adi_result.mint_tx_hash,
        adi_result.lock_tx_hash,
        "locked",
        "pending",
    )
    return {
        "rwa_adi_id": rwa_id,
        "asset_id": adi_result.asset_id,
        "beneficiary": beneficiary,
        "mint_tx_hash": adi_result.mint_tx_hash,
        "lock_tx_hash": adi_result.lock_tx_hash,
        "status": "locked",
    }


@router.post("/rwa/{rwa_id}/bootstrap", status_code=status.HTTP_200_OK)
async def bootstrap_existing_rwa(rwa_id: int, body: Optional[BootstrapRWAInput] = Body(None)) -> dict:
    """
    Bootstrap an existing RWA (status=created) on ADI: mint+lock. Use when an RWA was created
    with POST /rwa only and you want to run the ADI step so pipeline fields populate.
    """
    pool = await get_pool()
    row = await pool.fetchrow(
        "SELECT id, starting_kwh, bootstrap_status FROM rwas WHERE id = $1",
        rwa_id,
    )
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="RWA not found")
    if str(row["bootstrap_status"]) != "created":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"RWA {rwa_id} has bootstrap_status={row['bootstrap_status']}; only RWAs with status 'created' can be bootstrapped",
        )
    if await _rwa_creation_in_progress(pool, exclude_rwa_id=rwa_id):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Another RWA is currently in creation. Wait for it to finish before bootstrapping.",
        )
    beneficiary = (body and body.beneficiary) or RWA_DEFAULT_BENEFICIARY
    if not ADI_RPC_URL or not ADI_VAULT_ADDRESS or not ADI_OPERATOR_PRIVATE_KEY:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Missing ADI config (ADI_RPC_URL, ADI_VAULT_ADDRESS, ADI_OPERATOR_PRIVATE_KEY)",
        )
    if not beneficiary:
        beneficiary = operator_address_from_key(ADI_OPERATOR_PRIVATE_KEY)
    kwh = int(row["starting_kwh"])
    try:
        adi_result = await asyncio.to_thread(
            bootstrap_rwa_on_adi,
            adi_rpc_url=ADI_RPC_URL,
            vault_address=ADI_VAULT_ADDRESS,
            operator_private_key=ADI_OPERATOR_PRIVATE_KEY,
            beneficiary=beneficiary,
            expected_yield_kwh=kwh,
        )
    except Exception as exc:
        await pool.execute(
            "UPDATE rwas SET bootstrap_status = $2, beneficiary_address = $3 WHERE id = $1",
            rwa_id,
            "failed",
            beneficiary,
        )
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"ADI bootstrap failed: {exc}") from exc

    await pool.execute(
        """
        UPDATE rwas
        SET adi_asset_id = $2,
            adi_owner_address = $3,
            beneficiary_address = $4,
            mint_tx_hash = $5,
            lock_tx_hash = $6,
            bootstrap_status = $7,
            hedera_mint_status = $8
        WHERE id = $1
        """,
        rwa_id,
        adi_result.asset_id,
        adi_result.owner,
        beneficiary,
        adi_result.mint_tx_hash,
        adi_result.lock_tx_hash,
        "locked",
        "pending",
    )
    return {
        "rwa_adi_id": rwa_id,
        "asset_id": adi_result.asset_id,
        "beneficiary": beneficiary,
        "mint_tx_hash": adi_result.mint_tx_hash,
        "lock_tx_hash": adi_result.lock_tx_hash,
        "status": "locked",
    }


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
               r.adi_asset_id,
               r.bootstrap_status,
               r.mint_tx_hash,
               r.lock_tx_hash,
               r.hedera_mint_tx_hash,
               r.hedera_mint_status,
               r.beneficiary_address,
               (SELECT kwh FROM rwa_timeseries WHERE rwa_id = r.id ORDER BY ts DESC LIMIT 1) AS latest_kwh,
               (SELECT ts FROM rwa_timeseries WHERE rwa_id = r.id ORDER BY ts DESC LIMIT 1) AS latest_ts,
               (SELECT price_cents FROM rwa_timeseries WHERE rwa_id = r.id ORDER BY ts DESC LIMIT 1) AS latest_price_cents
        FROM rwas r
        ORDER BY r.id
        """
    )
    return [
        {
            "rwa_adi_id": int(r["rwa_id"]),
            "latest_kwh": int(r["latest_kwh"]) if r["latest_kwh"] is not None else None,
            "latest_ts": r["latest_ts"].isoformat() if r["latest_ts"] and hasattr(r["latest_ts"], "isoformat") else str(r["latest_ts"]) if r["latest_ts"] else None,
            "latest_price_cents": int(r["latest_price_cents"]) if r["latest_price_cents"] is not None else None,
            "asset_id": int(r["adi_asset_id"]) if r["adi_asset_id"] is not None else None,
            "bootstrap_status": str(r["bootstrap_status"]) if r["bootstrap_status"] is not None else None,
            "mint_tx_hash": str(r["mint_tx_hash"]) if r["mint_tx_hash"] is not None else None,
            "lock_tx_hash": str(r["lock_tx_hash"]) if r["lock_tx_hash"] is not None else None,
            "hedera_mint_tx_hash": str(r["hedera_mint_tx_hash"]) if r["hedera_mint_tx_hash"] is not None else None,
            "hedera_mint_status": str(r["hedera_mint_status"]) if r["hedera_mint_status"] is not None else None,
            "beneficiary_address": str(r["beneficiary_address"]) if r["beneficiary_address"] is not None else None,
        }
        for r in rows
    ]


@router.get("/rwa/feed")
async def rwa_feed(limit: int = Query(40, ge=1, le=300)) -> list:
    """
    Latest oracle/yield updates derived from RWA ingest path.
    Intended for trader immutable stream.
    """
    pool = await get_pool()
    rows = await pool.fetch(
        """
        SELECT id, rwa_id, price_cents, kwh, source_tx_hash, source_log_index, created_at
        FROM rwa_oracle_updates
        ORDER BY created_at DESC
        LIMIT $1
        """,
        limit,
    )
    return [
        {
            "id": int(r["id"]),
            "rwa_adi_id": int(r["rwa_id"]),
            "price_cents": int(r["price_cents"]),
            "kwh": int(r["kwh"]),
            "tx_hash": str(r["source_tx_hash"]) if r["source_tx_hash"] is not None else None,
            "log_index": int(r["source_log_index"]) if r["source_log_index"] is not None else None,
            "ts": r["created_at"].isoformat() if hasattr(r["created_at"], "isoformat") else str(r["created_at"]),
            "source": "oracle",
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
    """Current asset price in cents. For RWA ids uses latest from rwa_timeseries; else telemetry_points, rwa_site_state, rwa_timeseries."""
    pool = await get_pool()
    # If this id is an RWA, use latest price from rwa_timeseries only (authoritative for preview)
    is_rwa = await pool.fetchval("SELECT 1 FROM rwas WHERE id = $1", site_id)
    if is_rwa:
        rwa_row = await pool.fetchrow(
            "SELECT price_cents FROM rwa_timeseries WHERE rwa_id = $1 ORDER BY ts DESC LIMIT 1",
            site_id,
        )
        if rwa_row is not None:
            return {"site_id": site_id, "asset_price_cents": int(rwa_row["price_cents"])}
        return {"site_id": site_id, "asset_price_cents": None}
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
    await pool.execute("TRUNCATE TABLE rwa_oracle_updates")
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
