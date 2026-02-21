# Run Everything: Agent → Postgres Data → Hedera Trade

End-to-end: AI copilot gets data from SolarTick/Postgres, user executes a trade, agent submits to trading-api → Hedera `writeOption`.

**Do not commit `.env` files or private keys.** Use `.env` (gitignored) per package; see `.env.example` where present. For common pitfalls (writer/desk alignment, strike from Postgres, revert decoding), see **docs/HEDERA_E2E_NOTES.md**.

## Prerequisites

- `.env` files are set up in:
  - `solartick/.env`
  - `packages/relayer-python/.env`
  - `packages/ai-copilot/.env`
  - `packages/trading-api/.env`
- Writer wallet (from `WRITER_PRIVATE_KEY` / `HEDERA_OPERATOR_KEY`) has ySOLAR and has approved the options desk.
- Oracle address in relayer matches your YieldOracle (relayer pushes price from Postgres → Hedera). Run `npm run hedera:ensure` from repo root to deploy if needed and sync relayer/trading-api addresses (see `docs/deployed-addresses.example.json` for manifest shape).

## 1. Start Postgres + SolarTick backend (data source)

```bash
cd solartick
docker compose up db backend -d
# Or full stack: docker compose up --build
```

- Backend: http://localhost:8000  
- Postgres: localhost:5432 (user `postgres`, password `postgres`, db `solartick`)

Optional: create an RWA and/or ingest some telemetry so the agent has price/KWH data.

## 2. Start relayer (Postgres → Oracle on Hedera)

Relayer reads `oracle_pending_updates` from the **same** Postgres and pushes price to Hedera.

```bash
cd packages/relayer-python
# Ensure DATABASE_URL in .env is postgresql://postgres:postgres@localhost:5432/solartick
pip install -r requirements.txt
python -m src.service
```

Leave it running so new prices from the backend get pushed on-chain.

## 3. Start trading-api (writeOption on Hedera)

```bash
cd packages/trading-api
npm install
node server.js
```

- API: http://localhost:3001  
- `POST /write-option` is called by the ai-copilot when user confirms a trade.

## 4. Start AI copilot (chat + intent + submit)

```bash
cd packages/ai-copilot
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

If port 8000 is already used by SolarTick backend, use another port (e.g. 8003) and set `PORT=8003` in ai-copilot `.env`. Then point the frontend at the copilot port.

- Copilot: http://localhost:8000 (or your PORT)
- In `.env`: `SOLARTICK_API_BASE_URL=http://localhost:8000` — if SolarTick backend is on 8000, use that; if copilot is on 8003, SolarTick can stay on 8000.
- Set `HEDERA_API_BASE_URL=http://localhost:3001` and `HEDERA_MOCK=false` so submit calls the trading-api.

## 5. (Optional) SolarTick publisher

If you want live KWH/price updates and oracle updates from your stack:

```bash
cd solartick && docker compose up backend publisher
# Publisher uses BACKEND_URL to get RWAs and push KWH to Monad; webhook then updates Postgres and enqueues price for relayer.
```

## Strike price = asset price from Postgres

At submit time the ai-copilot uses the **current asset price in cents** from SolarTick (Postgres) as the strike, not the number the user said in chat. That keeps the option aligned with the oracle (contract compares `yieldIndex >= strike` at settlement; relayer pushes `price_cents` from Postgres). Set `SOLARTICK_API_BASE_URL` and optionally `SOLARTICK_SITE_ID` (default 1) in ai-copilot `.env`. If no price is available, the intent's user-provided strike is used and a warning is logged.

## Flow to test

1. **Data**: Backend has telemetry and/or RWA price (from ingest or Create RWA). Relayer has pushed at least one price to the oracle so the desk doesn’t see “oracle not initialized” or “stale”.
2. **Chat**: Open the UI (or `curl`), switch to TRADE mode, ask to write a covered call (e.g. amount 100, strike 500, 30 days).
3. **Intent**: Agent returns a JSON intent; save it via `POST /intents` (or whatever the UI does).
4. **Submit**: Call `POST /intents/{intent_id}/submit`. Copilot fetches current asset price from SolarTick, then calls trading-api `POST /write-option` with that strike (in cents), so `writeOption(buyer, amount, strike, expiry)` on Hedera uses the real asset price.

## 6. Frontend (Trader Terminal)

The Next.js app in `packages/frontend` talks to both the SolarTick backend (RWA data, pricing graph, oracle feed) and the AI copilot (chat, intents).

```bash
cd packages/frontend
cp .env.example .env   # then edit if needed
npm install
npm run dev
```

- App: http://localhost:3000 — open **Terminal** for the trading UI.

**Env (optional):** In `packages/frontend/.env`:

- `NEXT_PUBLIC_SOLARTICK_API_URL` — SolarTick backend (e.g. `http://localhost:8000`). If unset, same-origin is used.
- `NEXT_PUBLIC_COPILOT_API_URL` — AI copilot (e.g. `http://localhost:8003`). If unset, same-origin is used.

**UI behavior:**

- **Asset Discovery** lists RWAs from `GET /api/rwas` (and current price). If none, shows mock assets.
- **Deep Dive** chart uses `GET /api/rwa/{id}/data` and `/api/rwa/{id}/latest` for price time-series when the selected asset is an RWA.
- **AI Copilot** has **Ask / Analyze** vs **Trading Agent** toggle; chat uses `POST /chat` with `mode`. The panel shows **Live** or **Offline** depending on `NEXT_PUBLIC_COPILOT_API_URL` and copilot health. Trade intents can be submitted via **Save & Submit to Hedera** (calls copilot `POST /intents` then `POST /intents/{id}/submit`). Start the copilot on port 8003 when SolarTick is on 8000.
- **Immutable Stream** (bottom bar) uses `GET /api/rwa/feed` for oracle updates when the SolarTick backend is configured.

## Port summary

| Service       | Port | Purpose                    |
|---------------|------|----------------------------|
| SolarTick backend | 8000 | Telemetry, RWA API, price (Postgres) |
| AI copilot    | 8000 or 8003 | Chat, intents, submit      |
| Trading-api   | 3001 | writeOption to Hedera      |
| Relayer       | —    | Process only (Postgres → Oracle)     |

If both SolarTick and ai-copilot use 8000, run one on 8000 and the other on 8003, and set `SOLARTICK_API_BASE_URL` in the copilot to the SolarTick backend URL.

## Troubleshooting

- **Oracle not initialized / stale**: Start the relayer and ensure the backend has enqueued at least one price (create RWA + ingest or legacy telemetry).
- **writeOption fails (502 / CONTRACT_*)**: (1) **ERC20InsufficientAllowance** (selector 0xfb8f41b2): the writer used by trading-api has not approved the **desk address** that trading-api uses. Check alignment: run `cd packages/trading-api && node print-writer-desk.js` to see writer + desk. Then: (a) Set `WRITER_PRIVATE_KEY` in trading-api `.env` to the **same** value as `HEDERA_OPERATOR_KEY` in `packages/relayer-python/.env`. (b) Do **not** set `HEDERA_OPTIONS_DESK_ADDRESS` in trading-api `.env` (so it uses the desk from `docs/deployed-addresses.json`). (c) Run once: `cd packages/contracts-hedera && npx hardhat run scripts/manual-write-option.js --network hederaTestnet` (that script uses the same relayer `.env` key and manifest desk; it mints, approves that desk, and funds it). If your trading-api must use a different desk (e.g. you set `HEDERA_OPTIONS_DESK_ADDRESS=0x236b...`), run the manual script with that desk: set `HEDERA_OPTIONS_DESK_ADDRESS` and `HEDERA_YSOLAR_ADDRESS` in the same env when running the script so it approves that desk. (2) **OracleNotInitialized / OracleStale**: start the relayer so it pushes at least one price from Postgres to the YieldOracle.
- **Agent has no price**: Set `SOLARTICK_API_BASE_URL` to the SolarTick backend and ensure `GET /api/price?site_id=1` (or your RWA id) returns data.
