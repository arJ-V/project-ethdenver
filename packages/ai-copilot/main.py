"""
ySolar AI Copilot — FastAPI entry point.
Two-mode agent (Ask / Trade), off-chain intents, REST for UI.
"""
import os

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers import chat, intents

app = FastAPI(title="ySolar AI Copilot")

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(chat.router)
app.include_router(intents.router)


@app.get("/health")
def health():
    return {"status": "ok"}
