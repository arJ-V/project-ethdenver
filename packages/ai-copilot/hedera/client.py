"""
Wraps teammate Hedera backend. Maps TradeIntent to writeOption() call.
Confirm endpoint path with Hedera teammate; use HEDERA_API_BASE_URL when they deploy.
Mock supported for dev when API is not ready.
"""
import os

import httpx

from intents.schema import TradeIntent

BASE = os.environ.get("HEDERA_API_BASE_URL", "http://localhost:3001")
USE_MOCK = os.environ.get("HEDERA_MOCK", "true").lower() == "true"


async def submit_to_hedera(intent: TradeIntent) -> dict:
    if USE_MOCK:
        return {"status": "submitted", "tx_hash": "mock-tx-0x123", "option_id": "mock-option-1"}

    payload = {
        "buyer": intent.buyer,
        "amount": str(intent.amount),
        "strike": str(intent.strike),
        "expiry": intent.expiry,
    }
    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            r = await client.post(f"{BASE}/write-option", json=payload)
            r.raise_for_status()
            data = r.json()
            return {
                "status": "submitted",
                "tx_hash": data.get("txHash"),
                "option_id": data.get("optionId"),
            }
        except httpx.HTTPError as e:
            return {"status": "failed", "error": str(e)}
