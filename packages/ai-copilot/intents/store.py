"""
In-memory intent store. Persists for server lifetime only.
"""
from typing import Optional, Union
from intents.schema import TradeIntent, IntentStatus

_intents: dict[str, TradeIntent] = {}


def save_intent(i: TradeIntent) -> TradeIntent:
    _intents[i.intent_id] = i
    return i


def get_intent(intent_id: str) -> Optional[TradeIntent]:
    return _intents.get(intent_id)


def update_status(
    intent_id: str,
    status: Union[str, IntentStatus],
    tx_hash: Optional[str] = None,
    option_id: Optional[str] = None,
) -> None:
    i = _intents.get(intent_id)
    if i:
        i.status = IntentStatus(status) if isinstance(status, str) else status
        if tx_hash:
            i.tx_hash = tx_hash
        if option_id is not None:
            i.option_id = option_id
