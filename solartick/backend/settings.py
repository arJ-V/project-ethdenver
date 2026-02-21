import os
from typing import Optional

def _str(value: Optional[str]) -> Optional[str]:
    return value if value else None

def _float(key: str, default: float) -> float:
    raw = os.environ.get(key)
    return float(raw) if raw is not None else default

DATABASE_URL: str = os.environ.get("DATABASE_URL", "postgresql://postgres:postgres@db:5432/solartick")
QN_STREAMS_WEBHOOK_SECRET: Optional[str] = _str(os.environ.get("QN_STREAMS_WEBHOOK_SECRET"))
CORS_ORIGINS: str = os.environ.get("CORS_ORIGINS", "http://localhost:5173,http://localhost:3000")
SITE_DEFAULT: int = int(os.environ.get("SITE_DEFAULT", "1"))
DEMO_RESET_SECRET: Optional[str] = _str(os.environ.get("DEMO_RESET_SECRET"))

# RWA asset pricing (MVP: systematic price from yield)
RWA_ESTABLISHMENT_RATIO: float = _float("RWA_ESTABLISHMENT_RATIO", 1.0)  # initial_price = ratio * (yield / token_amount_minted)
RWA_TOKEN_AMOUNT_MINTED: int = int(os.environ.get("RWA_TOKEN_AMOUNT_MINTED", "1000"))  # tokens minted per site at establishment
RWA_PRICE_DELTA_MULTIPLIER_MIN: float = _float("RWA_PRICE_DELTA_MULTIPLIER_MIN", 0.0001)
RWA_PRICE_DELTA_MULTIPLIER_MAX: float = _float("RWA_PRICE_DELTA_MULTIPLIER_MAX", 0.001)
