from datetime import datetime
from typing import Optional
from pydantic import BaseModel


class TelemetryPoint(BaseModel):
    site_id: int
    ts: datetime
    watt_hours: int
    battery_soc: Optional[float] = None
    tx_hash: str
    block_number: int
    log_index: int


class StreamsEvent(BaseModel):
    site_id: int
    ts: int  # unix seconds
    watt_hours: int
    battery_soc: float
    tx_hash: str
    block_number: int
    log_index: int
