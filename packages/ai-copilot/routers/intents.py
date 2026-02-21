"""
POST /intents, GET /intents/{id}, POST /intents/{id}/submit.
"""
import time

from fastapi import APIRouter, HTTPException
from pydantic import ValidationError

from intents.schema import TradeIntent
from intents.store import save_intent, get_intent, update_status
from hedera.client import submit_to_hedera

router = APIRouter(prefix="/intents", tags=["intents"])

# Contract minimum: expiry must be at least this many seconds from now
MIN_EXPIRY_SECONDS = 180
# Default expiry when client sends a past timestamp (30 days)
DEFAULT_EXPIRY_SECONDS = 30 * 24 * 3600


@router.post("")
async def create_intent(data: dict):
    # If expiry is in the past (common when LLM emits a fixed example timestamp), fix it to now + 30 days
    now = int(time.time())
    expiry = data.get("expiry")
    if isinstance(expiry, int) and expiry < now + MIN_EXPIRY_SECONDS:
        data = {**data, "expiry": now + DEFAULT_EXPIRY_SECONDS}

    try:
        intent = TradeIntent(**data)
    except ValidationError as e:
        # Return 422 with Pydantic error list so client can show "expiry must be at least 180 seconds from now" etc.
        raise HTTPException(status_code=422, detail=e.errors()) from e
    return save_intent(intent).model_dump()


@router.get("/{intent_id}")
async def get(intent_id: str):
    intent = get_intent(intent_id)
    if not intent:
        raise HTTPException(status_code=404, detail="Not found")
    return intent.model_dump()


@router.post("/{intent_id}/submit")
async def submit(intent_id: str):
    intent = get_intent(intent_id)
    if not intent:
        raise HTTPException(status_code=404, detail="Not found")
    if intent.status.value not in ("draft", "approved"):
        raise HTTPException(
            status_code=400,
            detail=f"Cannot submit status={intent.status.value}",
        )
    result = await submit_to_hedera(intent)
    update_status(
        intent_id,
        result["status"],
        tx_hash=result.get("tx_hash"),
        option_id=result.get("option_id"),
    )
    return get_intent(intent_id).model_dump()
