# ai-copilot (ySolar AI Copilot)

Python FastAPI service: two-mode agent (Ask / Trade), off-chain intent store, REST API for the React UI. Calls teammate Hedera backend for `writeOption()` execution.

**In scope:** 0G inference (or fallback OpenAI), session + mode switching, intent validation, `POST /chat`, `POST /intents`, `POST /intents/{id}/submit`, `GET /intents/{id}`.

**Not in scope:** Hedera contracts, React UI, QuickNode, ADI vault, Schedule Service.

## Integration docs

- `ORDER_SUBMISSION_GUIDE.md`: how AI submits orders in the current MVP and how to add a lightweight orderbook intent layer.

## Quick start

```bash
cd packages/ai-copilot
python3 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env        # Edit with 0G keys and HEDERA_API_BASE_URL
uvicorn main:app --reload --port 8000
```

- Health: `curl http://localhost:8000/health`
- Chat (Ask): `curl -X POST http://localhost:8000/chat -H 'Content-Type: application/json' -d '{"session_id":"s1","message":"What is a covered call?","mode":"ask"}'`

## Testing with OpenAI (without 0G)

While the 0G account is being fixed, you can run the agent with OpenAI only:

1. Set in `.env`: `USE_0G=false` and `OPENAI_API_KEY=sk-...`
2. Run the copilot: `uvicorn main:app --reload --port 8000`
3. Chat and trade mode will use `OPENAI_MODEL` (default `gpt-4o-mini`).

If 0G is enabled but fails at runtime, the agent automatically falls back to OpenAI for the rest of the session.

## Env

- `USE_0G` — set to `false` to use plain OpenAI client instead of 0G.
- `OPENAI_API_KEY` — OpenAI key used when 0G is unavailable or fails at runtime.
- `OPENAI_BASE_URL` — override OpenAI endpoint if needed (optional).
- `DEMO_WRITER_ADDRESS` / `DEMO_BUYER_ADDRESS` — wallet addresses injected into the TRADE system prompt so users don’t have to say writer/buyer (demo default; set in `.env`).
- `SOLARTICK_API_BASE_URL` — when set, the agent fetches QuickNode/SolarTick telemetry (yield, battery %) and injects it into ASK and TRADE context. Optional.
- `SOLARTICK_SITE_ID` — telemetry site ID (default `1`).
- `HEDERA_MOCK` — set to `true` (default) to skip real submission; set `false` when using the trading-api (or another write-option backend).
- `HEDERA_API_BASE_URL` — URL of the order-submission API (e.g. `http://localhost:3001` when running `packages/trading-api`).
- See `.env.example` for 0G, OpenAI, Hedera, and SolarTick URLs.

## QuickNode / SolarTick telemetry

When the SolarTick backend is running (QuickNode branch: `solartick/`), the agent can use live solar telemetry:

1. Start SolarTick: `cd solartick && docker compose up --build` (backend on port 8000).
2. In ai-copilot `.env`: `SOLARTICK_API_BASE_URL=http://localhost:8000` (and optionally `SOLARTICK_SITE_ID=1`).
3. In **ASK** and **TRADE** mode, the agent receives a short summary of the last 24h (latest watt_hours, battery_soc, period averages) and can reference it when discussing yield or suggesting trades.

If `SOLARTICK_API_BASE_URL` is not set, the agent runs as before with no telemetry. See `docs/quicknode.md` for API details.

## Order submission (trading-api)

The agent submits orders by calling **POST /write-option** on a separate service. Use the **trading-api** package:

```bash
cd packages/trading-api
npm install
cp .env.example .env   # Set WRITER_PRIVATE_KEY, HEDERA_RPC_URL
npm start              # runs on port 3001
```

Then set in ai-copilot `.env`: `HEDERA_API_BASE_URL=http://localhost:3001` and `HEDERA_MOCK=false`.

## API (for UI)

- **POST /chat** — `{ session_id, message, mode }` → `{ session_id, mode, content, intent? }`
- **POST /intents** — body = intent JSON → returns saved intent with `intent_id`
- **POST /intents/{id}/submit** — calls trading-api `/write-option`, returns intent with `tx_hash`, `option_id`
- **GET /intents/{id}** — intent status + tx_hash + option_id

See `ORDER_SUBMISSION_GUIDE.md` and `ySolar_Cursor_Implementation_Guide.txt` for flows and demo script.
