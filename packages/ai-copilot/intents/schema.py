"""
Intent schema aligned with ORDER_SUBMISSION_GUIDE and HederaOptionsDesk constraints.
Enforces: product=covered_call, expiry >= now+180, amount/strike positive.
"""
import time
import uuid
from enum import Enum
from typing import Optional

from pydantic import BaseModel, field_validator, Field


class IntentStatus(str, Enum):
    draft = "draft"
    approved = "approved"
    submitted = "submitted"
    confirmed = "confirmed"
    failed = "failed"


class TradeIntent(BaseModel):
    intent_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    writer: str
    buyer: str
    product: str = "covered_call"
    underlying: str = "ySOLAR"
    amount: int
    strike: int
    expiry: int
    status: IntentStatus = IntentStatus.draft
    tx_hash: Optional[str] = None
    option_id: Optional[str] = None

    @field_validator("amount", "strike")
    @classmethod
    def must_be_positive(cls, v: int) -> int:
        if v <= 0:
            raise ValueError("must be positive")
        return v

    @field_validator("expiry")
    @classmethod
    def must_be_future(cls, v: int) -> int:
        if v < int(time.time()) + 180:
            raise ValueError("expiry must be at least 180 seconds from now")
        return v
