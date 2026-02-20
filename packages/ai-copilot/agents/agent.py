"""
Session management, mode switching, and chat loop.
Two modes: ask (analyst) and trade (intent extraction -> JSON).
"""
import json
import os
from typing import Optional

from agents.client import get_0g_client, force_openai_client
from agents.prompts import (
    ASK_SYSTEM_PROMPT,
    get_trade_system_prompt,
    TRADE_CONTEXT_HANDOFF,
)
from telemetry.client import get_telemetry_context

# Model selection: use OpenAI model if forcing OpenAI, otherwise use 0G model
USE_0G = os.environ.get("USE_0G", "true").lower() == "true"
if USE_0G:
    MODEL = os.environ.get("A0G_MODEL", "qwen-2.5-7b-instruct")
else:
    MODEL = os.environ.get("OPENAI_MODEL", "gpt-4o-mini")  # Default to cost-effective model


class AgentSession:
    def __init__(self, session_id: str):
        self.session_id = session_id
        self.mode = "ask"
        self.last_mode = "ask"
        self.history: list[dict] = []

    def switch_mode(self, new_mode: str) -> None:
        self.last_mode = self.mode
        self.mode = new_mode

    def _build_messages(self, user_message: str) -> list[dict]:
        if self.mode == "trade":
            system = get_trade_system_prompt()
            if self.last_mode == "ask" and len(self.history) > 0:
                system += "\n\n" + TRADE_CONTEXT_HANDOFF
        else:
            system = ASK_SYSTEM_PROMPT

        # Inject QuickNode/SolarTick telemetry when available (SOLARTICK_API_BASE_URL set)
        telemetry = get_telemetry_context(hours=24)
        if telemetry:
            system += "\n\n" + telemetry

        messages = [{"role": "system", "content": system}]
        messages += self.history
        messages.append({"role": "user", "content": user_message})
        return messages

    def chat(self, user_message: str) -> dict:
        client = get_0g_client()
        messages = self._build_messages(user_message)
        model = MODEL

        try:
            response = client.chat.completions.create(
                model=model,
                messages=messages,
                temperature=0.1 if self.mode == "trade" else 0.7,
                max_tokens=1024,
            )
        except Exception:
            # If 0G path fails at runtime, switch to OpenAI and use OpenAI model
            client = force_openai_client()
            model = os.environ.get("OPENAI_MODEL", "gpt-4o-mini")
            response = client.chat.completions.create(
                model=model,
                messages=messages,
                temperature=0.1 if self.mode == "trade" else 0.7,
                max_tokens=1024,
            )

        content = response.choices[0].message.content or ""
        self.history.append({"role": "user", "content": user_message})
        self.history.append({"role": "assistant", "content": content})
        self.last_mode = self.mode
        intent = _try_extract_intent(content) if self.mode == "trade" else None
        return {"content": content, "mode": self.mode, "intent": intent}


def _try_extract_intent(text: str) -> Optional[dict]:
    try:
        start = text.index("{")
        end = text.rindex("}") + 1
        return json.loads(text[start:end])
    except (ValueError, json.JSONDecodeError):
        return None


_sessions: dict[str, "AgentSession"] = {}


def get_or_create_session(sid: str) -> AgentSession:
    if sid not in _sessions:
        _sessions[sid] = AgentSession(sid)
    return _sessions[sid]
