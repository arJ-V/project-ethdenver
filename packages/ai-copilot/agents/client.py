"""
0G inference client. Uses OpenAI-compatible interface.
Fallback: if a0g/Node.js is unavailable or fails at runtime,
switch over to plain OpenAI and keep using it.
"""
import os
from typing import Optional
from openai import OpenAI

_client: Optional[OpenAI] = None
_forced_openai: bool = False


def _create_openai_client() -> OpenAI:
    return OpenAI(
        base_url=os.environ.get("OPENAI_BASE_URL", "https://api.openai.com/v1"),
        api_key=os.environ.get("OPENAI_API_KEY", "placeholder"),
    )


def force_openai_client() -> OpenAI:
    """
    Permanently switch this process to OpenAI-only mode.
    Used when 0G fails at runtime and we want sticky fallback.
    """
    global _client, _forced_openai
    _forced_openai = True
    _client = _create_openai_client()
    return _client


def get_0g_client() -> OpenAI:
    global _client
    if _client is None:
        # If we've already decided to force OpenAI, never touch 0G again
        if _forced_openai:
            _client = _create_openai_client()
            return _client

        use_0g = os.environ.get("USE_0G", "true").lower() == "true"
        if use_0g:
            try:
                from a0g.base import A0G

                _a0g = A0G(
                    private_key=os.environ["A0G_PRIVATE_KEY"],
                    rpc_url=os.environ.get(
                        "A0G_RPC_URL", "https://evmrpc-testnet.0g.ai"
                    ),
                )
                provider = os.environ.get(
                    "A0G_PROVIDER_ADDRESS",
                    "0xa48f01287233509FD694a22Bf840225062E67836",
                )
                _client = _a0g.get_openai_client(provider)
            except Exception:
                # Fallback: plain OpenAI client (replace with provider endpoint if known)
                _client = _create_openai_client()
        else:
            _client = _create_openai_client()
    return _client
