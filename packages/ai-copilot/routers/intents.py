"""
POST /intents, GET /intents/{id}, POST /intents/{id}/submit.
"""
from fastapi import APIRouter, HTTPException

from intents.schema import TradeIntent
from intents.store import save_intent, get_intent, update_status
from hedera.client import submit_to_hedera

router = APIRouter(prefix="/intents", tags=["intents"])


@router.post("")
async def create_intent(data: dict):
    intent = TradeIntent(**data)
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
