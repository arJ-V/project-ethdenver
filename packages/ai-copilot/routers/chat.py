"""
POST /chat — session-aware chat with mode (ask | trade).
"""
from fastapi import APIRouter
from pydantic import BaseModel

from agents.agent import get_or_create_session

router = APIRouter()


class ChatRequest(BaseModel):
    session_id: str
    message: str
    mode: str = "ask"


@router.post("/chat")
async def chat(req: ChatRequest):
    session = get_or_create_session(req.session_id)
    if session.mode != req.mode:
        session.switch_mode(req.mode)
    result = session.chat(req.message)
    return {
        "session_id": req.session_id,
        "mode": result["mode"],
        "content": result["content"],
        "intent": result.get("intent"),
    }
