import hmac
import hashlib
import logging
from typing import Optional

from settings import QN_STREAMS_WEBHOOK_SECRET

logger = logging.getLogger(__name__)


def verify_webhook_signature(
    payload: bytes,
    signature_header: Optional[str],
    nonce_header: Optional[str],
    timestamp_header: Optional[str],
) -> bool:
    """
    Verify QuickNode Streams webhook signature.
    
    QuickNode computes signature as: HMAC-SHA256(secret, nonce + timestamp + payload)
    Headers: X-QN-Signature, X-QN-Nonce, X-QN-Timestamp
    """
    if not QN_STREAMS_WEBHOOK_SECRET:
        logger.error("QN_STREAMS_WEBHOOK_SECRET not set")
        return False
    
    if not signature_header:
        logger.error("Missing X-QN-Signature header")
        return False
    
    if not nonce_header:
        logger.error("Missing X-QN-Nonce header")
        return False
    
    if not timestamp_header:
        logger.error("Missing X-QN-Timestamp header")
        return False
    
    # QuickNode signature format: nonce + timestamp + payload (as strings)
    try:
        payload_str = payload.decode("utf-8") if isinstance(payload, bytes) else str(payload)
    except UnicodeDecodeError:
        logger.error("Failed to decode payload as UTF-8")
        return False
    
    signature_data = nonce_header + timestamp_header + payload_str
    
    # Compute HMAC-SHA256
    computed_signature = hmac.new(
        QN_STREAMS_WEBHOOK_SECRET.encode("utf-8"),
        signature_data.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    
    # Compare signatures (given signature is hex string, no prefix)
    given_signature = signature_header.strip()
    
    return hmac.compare_digest(computed_signature, given_signature)
