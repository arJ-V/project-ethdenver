"""
Systematic RWA asset pricing for MVP. All prices are in integer cents.

- At establishment: price_cents = round(ESTABLISHMENT_RATIO * (yield / token_amount_minted) * 100).
- After that: price_update_cents = round((new_yield - previous_yield) * k * 100), k bounded random.
"""
import logging
import random
from typing import Any, Dict, Optional

import asyncpg

from settings import (
    RWA_ESTABLISHMENT_RATIO,
    RWA_PRICE_DELTA_MULTIPLIER_MAX,
    RWA_PRICE_DELTA_MULTIPLIER_MIN,
    RWA_TOKEN_AMOUNT_MINTED,
)

_log = logging.getLogger(__name__)


def _establishment_price_cents(initial_yield: int, token_amount_minted: int) -> int:
    """Initial price in cents: ratio * (yield / token) * 100, rounded."""
    if token_amount_minted <= 0:
        return 0
    return int(round(RWA_ESTABLISHMENT_RATIO * (initial_yield / token_amount_minted) * 100))


async def get_or_update_site_price_cents(
    conn: asyncpg.Connection,
    site_id: int,
    new_yield: int,
    token_amount_minted: Optional[int] = None,
) -> int:
    """
    Establish RWA price for a site on first yield, or update from yield delta thereafter.
    Returns the asset price in cents to store for this telemetry point.
    """
    token = token_amount_minted if token_amount_minted is not None else RWA_TOKEN_AMOUNT_MINTED
    row: Optional[Dict[str, Any]] = await conn.fetchrow(
        "SELECT initial_yield, previous_yield, current_price_cents FROM rwa_site_state WHERE site_id = $1",
        site_id,
    )
    if row is None:
        initial_yield = new_yield
        previous_yield = new_yield
        current_price_cents = _establishment_price_cents(initial_yield, token)
        await conn.execute(
            """
            INSERT INTO rwa_site_state (site_id, initial_yield, token_amount_minted, previous_yield, current_price_cents)
            VALUES ($1, $2, $3, $4, $5)
            """,
            site_id,
            initial_yield,
            token,
            previous_yield,
            current_price_cents,
        )
        _log.info(
            "rwa_establish site_id=%s initial_yield=%s token=%s current_price_cents=%s",
            site_id,
            initial_yield,
            token,
            current_price_cents,
        )
        return current_price_cents

    previous_yield = int(row["previous_yield"])
    old_price_cents = int(row["current_price_cents"]) if row["current_price_cents"] is not None else 0
    delta_yield = new_yield - previous_yield
    k = random.uniform(RWA_PRICE_DELTA_MULTIPLIER_MIN, RWA_PRICE_DELTA_MULTIPLIER_MAX)
    price_update_cents = int(round(delta_yield * k * 100))
    max_step = max(1, int(old_price_cents * 0.02))
    price_update_cents = max(-max_step, min(max_step, price_update_cents))
    current_price_cents = old_price_cents + price_update_cents
    if current_price_cents < 0:
        current_price_cents = 0
    await conn.execute(
        """
        UPDATE rwa_site_state SET previous_yield = $1, current_price_cents = $2, updated_at = now() WHERE site_id = $3
        """,
        new_yield,
        current_price_cents,
        site_id,
    )
    _log.debug(
        "rwa_update site_id=%s delta_yield=%s k=%.6f price_update_cents=%s current_price_cents=%s",
        site_id,
        delta_yield,
        k,
        price_update_cents,
        current_price_cents,
    )
    return current_price_cents


def compute_rwa_next_price_cents(
    latest_kwh: int,
    latest_price_cents: int,
    new_kwh: int,
) -> int:
    """
    Compute next price in cents for RWA time-series from (latest KWH, latest price) and new KWH.
    Uses delta * bounded random k; then caps the step so price doesn't bounce wildly (smoother macro trend).
    """
    delta_kwh = new_kwh - latest_kwh
    k = random.uniform(RWA_PRICE_DELTA_MULTIPLIER_MIN, RWA_PRICE_DELTA_MULTIPLIER_MAX)
    price_update_cents = int(round(delta_kwh * k * 100))
    # Cap single-step change to ±2% of current price for smoother, more appealing curves
    max_step = max(1, int(latest_price_cents * 0.02))
    price_update_cents = max(-max_step, min(max_step, price_update_cents))
    next_price = latest_price_cents + price_update_cents
    return max(0, next_price)
