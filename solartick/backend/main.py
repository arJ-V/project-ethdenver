import logging
from pathlib import Path

from dotenv import load_dotenv

# Load .env from repo root (solartick/.env) when running from solartick/backend
_env_dir = Path(__file__).resolve().parent.parent
load_dotenv(_env_dir / ".env")

from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, Response, status
from fastapi.middleware.cors import CORSMiddleware

from settings import CORS_ORIGINS
from db import get_pool, close_pool, init_db
from ingest import ingest_events, set_pubsub_notify
from live import publish
from api import router as api_router
from security import verify_webhook_signature

logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(app: FastAPI):
    pool = await get_pool()
    await init_db(pool)
    set_pubsub_notify(lambda site_id, payload: publish(site_id, payload))
    yield
    await close_pool()


app = FastAPI(title="SolarTick Backend", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[x.strip() for x in CORS_ORIGINS.split(",") if x.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(api_router)


@app.post("/ingest/quicknode/streams")
async def ingest_quicknode_streams(request: Request, response: Response):
    body = await request.body()

    # FastAPI lowercases header names automatically
    # QuickNode sends: X-QN-Signature, X-QN-Nonce, X-QN-Timestamp
    sig = request.headers.get("x-qn-signature")
    nonce = request.headers.get("x-qn-nonce")
    timestamp = request.headers.get("x-qn-timestamp")

    logger = logging.getLogger(__name__)
    logger.info("Webhook received - body length: %d bytes", len(body))

    # Allow QuickNode test connection PINGs without signature
    try:
        import json

        body_json = json.loads(body)
        if isinstance(body_json, dict) and body_json.get("message") == "PING":
            logger.info("Test PING received - allowing without signature")
            return {"ok": True, "message": "PONG", "test": True}
        
        # Log actual event data structure for debugging
        logger.info("Received webhook data: %s", json.dumps(body_json)[:500])
    except Exception as e:
        logger.warning("Failed to parse webhook body as JSON: %s", e)

    # For actual data, require signature verification
    if not verify_webhook_signature(body, sig, nonce, timestamp):
        logger.warning("Signature verification failed - headers present: sig=%s nonce=%s ts=%s", 
                      bool(sig), bool(nonce), bool(timestamp))
        response.status_code = status.HTTP_401_UNAUTHORIZED
        return {"ok": False, "error": "invalid signature"}

    inserted, total = await ingest_events(body)
    logger.info("Ingested webhook events: inserted=%s total=%s", inserted, total)
    return {"ok": True, "inserted": inserted, "total": total}


@app.get("/health")
async def health():
    try:
        pool = await get_pool()
        await pool.fetchval("SELECT 1")
        return {"status": "ok", "db": "connected"}
    except Exception as e:
        return {"status": "error", "db": str(e)}
