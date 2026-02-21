# End-to-End Test Plan

Test each part in order, then run the full flow. Work slowly at each stage and confirm before moving on.

---

## Prerequisites (one-time)

- **Node** and **npm** (trading-api, contracts-hedera)
- **Python 3.10+** and **venv** (ai-copilot)
- **OpenAI API key** (for agent; set in ai-copilot `.env`)
- **Hedera testnet** credentials (for real order submission): RPC URL and operator/writer private key

Optional:

- **docs/deployed-addresses.json** with `hedera.optionsDeskAddress` (and optionally `ySolarAddress`). If missing, set `HEDERA_OPTIONS_DESK_ADDRESS` (and `HEDERA_YSOLAR_ADDRESS` for manual script) in env.

---

## Stage 0: Env and one-time Hedera setup

**Goal:** Env files and (for real Hedera) writer has ySOLAR + allowance; desk has HBAR.

1. **Root / contracts-hedera env**
   - Copy `.env.hedera.example` to `.env` at repo root (or `packages/contracts-hedera` / `packages/relayer-python` as needed).
   - Set `HEDERA_RPC_URL` and `HEDERA_OPERATOR_KEY` (and optional `HEDERA_YSOLAR_ADDRESS`, `HEDERA_OPTIONS_DESK_ADDRESS` if not using deployed-addresses.json).

2. **One-time mint/approve/fund (real Hedera only)**
   ```bash
   cd packages/contracts-hedera
   npx hardhat run scripts/manual-write-option.js --network hederaTestnet
   ```
   - Uses manifest or env overrides; mints (if minter), approves 10k ySOLAR for desk, funds desk with 1 HBAR if needed, writes one option.
   - After this, trading-api can submit more options until balance/allowance run out.

**Check:** Script completes without revert. You can skip this if you only want to test with **mock** Hedera (Stage 2).

---

## Stage 1: Trading API only

**Goal:** Trading API starts and (optionally) accepts a write-option call.

1. **Env**
   ```bash
   cd packages/trading-api
   cp .env.example .env
   ```
   Set in `.env`:
   - `HEDERA_RPC_URL` (e.g. `https://testnet.hashio.io/api`)
   - `WRITER_PRIVATE_KEY` or `HEDERA_OPERATOR_KEY`
   - Optional: `HEDERA_OPTIONS_DESK_ADDRESS` if you don’t have `docs/deployed-addresses.json`

2. **Start**
   ```bash
   npm install
   npm start
   ```
   Server should listen on **http://localhost:3001**.

3. **Health**
   ```bash
   curl -s http://localhost:3001/health
   ```
   Expect: `{"status":"ok","service":"trading-api"}`.

4. **Optional: real write-option (curl)**  
   If you did Stage 0 and want to hit Hedera from the API:
   ```bash
   # From repo root, if test-write-option.sh exists:
   cd packages/trading-api && bash test-write-option.sh
   ```
   Or manual curl (buyer hex, amount, strike, expiry unix ≥ now+120):
   ```bash
   curl -s -X POST http://localhost:3001/write-option \
     -H "Content-Type: application/json" \
     -d '{"buyer":"0xabcdefabcdefabcdefabcdefabcdefabcdefabcd","amount":10,"strike":50,"expiry":'$(($(date +%s)+3600))'}'
   ```
   Expect 2xx with `txHash` and `optionId`, or 502 with revert reason if balance/allowance insufficient.

**Check:** Health OK; optional: write-option returns 2xx or expected error.

---

## Stage 2: AI Copilot only (mock Hedera)

**Goal:** Agent runs; ASK/TRADE and intent save/submit work with **mock** submission (no trading-api).

1. **Env**
   ```bash
   cd packages/ai-copilot
   cp .env.example .env
   ```
   Set in `.env`:
   - `OPENAI_API_KEY=sk-...`
   - `USE_0G=false`
   - `HEDERA_MOCK=true` (so submit does not call trading-api)
   - Optional: `DEMO_WRITER_ADDRESS`, `DEMO_BUYER_ADDRESS` (defaults in test script are fine)

2. **Venv and deps**
   ```bash
   python3 -m venv .venv
   source .venv/bin/activate   # Windows: .venv\Scripts\activate
   pip install -r requirements.txt
   ```

3. **Run agent flow test (mock)**
   ```bash
   python test_agent_flow.py
   ```
   Expect: ASK mode, TRADE intent extraction, intent save, submit returns mock tx (no real Hedera call).

**Check:** All four test sections pass; submit step shows MOCK and mock tx hash.

---

## Stage 3: AI Copilot + Trading API (real Hedera submit)

**Goal:** Same agent flow, but submit goes to trading-api and hits real Hedera.

1. **Trading API** must be running (Stage 1), with writer key and desk address configured.

2. **AI Copilot env**
   In `packages/ai-copilot/.env`:
   - `HEDERA_API_BASE_URL=http://localhost:3001`
   - `HEDERA_MOCK=false`
   - Keep `OPENAI_API_KEY`, `USE_0G=false`, and demo addresses as needed.

3. **Start AI Copilot**
   ```bash
   cd packages/ai-copilot
   source .venv/bin/activate
   uvicorn main:app --reload --port 8000
   ```

4. **Run agent flow test (real)**
   In another terminal:
   ```bash
   cd packages/ai-copilot
   source .venv/bin/activate
   HEDERA_MOCK=false python test_agent_flow.py
   ```
   - Test caps amount at 100 when not mock so demo writer balance is sufficient.
   - Expect: ASK, TRADE intent, save, submit → trading-api → Hedera; response shows REAL and real tx hash (or 502 with revert if balance/allowance issue).

**Check:** Full flow passes and submit returns real tx hash (or expected revert from API).

---

## Stage 4 (optional): Solartick telemetry

**Goal:** Agent gets SolarTick history in its context when Solartick backend is running.

1. Start **Solartick** (see `solartick/README.md`), e.g. backend API on a port (e.g. 8001).

2. In **ai-copilot** `.env`:
   - `SOLARTICK_API_BASE_URL=http://localhost:8001` (or your Solartick API base)

3. Restart ai-copilot; chat in ASK or TRADE mode. Agent system prompt will include telemetry context when the URL is set.

**Check:** Agent responses can reference recent telemetry (e.g. yield, wattage) when you ask.

---

## Final: Test all together

**Goal:** One full pass with trading-api + ai-copilot (and optional Solartick).

1. **Terminal 1 – Trading API**
   ```bash
   cd packages/trading-api && npm start
   ```

2. **Terminal 2 – AI Copilot**
   ```bash
   cd packages/ai-copilot && source .venv/bin/activate && uvicorn main:app --reload --port 8000
   ```

3. **Terminal 3 – E2E test**
   ```bash
   # From repo root (checks both services then runs test):
   ./scripts/e2e-run-agent-test.sh
   ```
   Or from ai-copilot:
   ```bash
   cd packages/ai-copilot && source .venv/bin/activate
   HEDERA_MOCK=false python test_agent_flow.py
   ```

4. **Optional: manual curl flow** (see [HEDERA_TEST.md](./HEDERA_TEST.md#34-optional-manual-curl-test))
   - POST /chat (mode=trade) with a natural-language trade request.
   - POST /intents with the extracted payload.
   - POST /intents/{id}/submit.

**Check:** test_agent_flow.py reports all tests passed and submit shows REAL and a real tx hash (or expected error). Manual curl flow matches.

---

## Quick reference

| Stage | What runs | Hedera |
|-------|-----------|--------|
| 0     | manual-write-option.js (one-time) | Real |
| 1     | trading-api only                  | Real (optional curl) |
| 2     | ai-copilot test_agent_flow.py      | Mock |
| 3     | ai-copilot + trading-api           | Real |
| 4     | + Solartick                        | Optional |
| Final | trading-api + ai-copilot + test_agent_flow.py | Real |

See also: [HEDERA_TEST.md](./HEDERA_TEST.md), [TESTING_GUIDE.md](../packages/ai-copilot/TESTING_GUIDE.md), [quicknode.md](./quicknode.md) (Solartick/telemetry).
