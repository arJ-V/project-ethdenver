"""
Wraps trading-api writeOption. Maps TradeIntent to POST /write-option.
Strike is taken from current asset price (Postgres/SolarTick) so contract settlement
matches the oracle yield index; user-provided strike is only used if no price is available.
Requires SOLARTICK_API_BASE_URL in ai-copilot .env. See docs/HEDERA_E2E_NOTES.md.
"""
import logging
import os
from typing import Optional

import httpx

from intents.schema import TradeIntent

BASE = os.environ.get("HEDERA_API_BASE_URL", "http://localhost:3001")
USE_MOCK = os.environ.get("HEDERA_MOCK", "true").lower() == "true"
_log = logging.getLogger(__name__)


def _strike_from_postgres(site_id: int) -> Optional[int]:
    """Current asset price in cents from SolarTick (Postgres). Same units as oracle/contract."""
    try:
        from telemetry.client import fetch_price
        data = fetch_price(site_id=site_id)
        if data and data.get("asset_price_cents") is not None:
            return int(data["asset_price_cents"])
    except Exception as e:
        _log.warning("strike_from_postgres site_id=%s error=%s", site_id, e)
    return None


async def submit_to_hedera(intent: TradeIntent, site_id: Optional[int] = None) -> dict:
    if USE_MOCK:
        return {"status": "submitted", "tx_hash": "mock-tx-0x123", "option_id": "mock-option-1"}

    strike_cents = intent.strike
    sid = site_id if site_id is not None else int(os.environ.get("SOLARTICK_SITE_ID", "1"))
    from_postgres = _strike_from_postgres(sid)
    if from_postgres is not None:
        strike_cents = from_postgres
        _log.info("submit strike from Postgres (site_id=%s): %s cents", sid, strike_cents)
    else:
        _log.warning(
            "no asset price from Postgres (site_id=%s); using intent strike=%s (may not match oracle)",
            sid,
            intent.strike,
        )

    payload = {
        "buyer": intent.buyer,
        "amount": str(intent.amount),
        "strike": str(strike_cents),
        "expiry": intent.expiry,
    }
    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            r = await client.post(f"{BASE}/write-option", json=payload)
            if r.is_success:
                data = r.json()
                return {
                    "status": "submitted",
                    "tx_hash": data.get("txHash"),
                    "option_id": data.get("optionId"),
                }
            # Surface trading-api error body (e.g. CONTRACT_ORACLENOTINITIALIZED, CONTRACT_TRANSFERFAILED)
            try:
                err_body = r.json()
                msg = err_body.get("error", {})
                if isinstance(msg, dict):
                    detail = msg.get("message") or str(msg.get("details") or "")
                    code = msg.get("code", "")
                    details_obj = msg.get("details")
                    if isinstance(details_obj, dict) and details_obj.get("selector"):
                        detail = f"{detail} [selector: {details_obj['selector']}]"
                else:
                    detail = str(msg)
                    code = ""
                error_str = f"{code}: {detail}" if code else detail
            except Exception:
                error_str = f"{r.status_code} {r.text or r.reason_phrase}"
            return {"status": "failed", "error": error_str}
        except httpx.HTTPError as e:
            return {"status": "failed", "error": str(e)}
