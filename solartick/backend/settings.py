import os
from typing import Optional

def _str(value: Optional[str]) -> Optional[str]:
    return value if value else None

DATABASE_URL: str = os.environ.get("DATABASE_URL", "postgresql://postgres:postgres@db:5432/solartick")
QN_STREAMS_WEBHOOK_SECRET: Optional[str] = _str(os.environ.get("QN_STREAMS_WEBHOOK_SECRET"))
CORS_ORIGINS: str = os.environ.get("CORS_ORIGINS", "http://localhost:5173,http://localhost:3000")
SITE_DEFAULT: int = int(os.environ.get("SITE_DEFAULT", "1"))
DEMO_RESET_SECRET: Optional[str] = _str(os.environ.get("DEMO_RESET_SECRET"))
