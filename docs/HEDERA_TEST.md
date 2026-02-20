# Testing AI Copilot with Hedera (Real Order Submission)

Use your Hedera testnet credentials to run the trading-api and submit real `writeOption` calls from the AI copilot.

**Important:** Put secrets only in `.env` files (gitignored). Never commit private keys.

---

## 1. Env you have (use these in `.env` files)

| Variable | Example / your value | Where to set |
|----------|----------------------|--------------|
| `HEDERA_RPC_URL` | `https://testnet.hashio.io/api` | trading-api |
| `HEDERA_OPERATOR_KEY` | `0x6b29...` (your key) | trading-api (as writer) |
| `HEDERA_YSOLAR_ADDRESS` | `0x42d184E9b7e1f80A5D19FD281e482cf84835D42F` | reference only; desk uses its own ySOLAR |
| Options desk | From `docs/deployed-addresses.json` → `hedera.optionsDeskAddress` | trading-api reads this unless you set `HEDERA_OPTIONS_DESK_ADDRESS` |

If your deployment uses a **different** options desk (e.g. tied to `HEDERA_YSOLAR_ADDRESS` 0x42d184...), set `HEDERA_OPTIONS_DESK_ADDRESS` in trading-api `.env` to that desk address. The repo’s `docs/deployed-addresses.json` has a desk for ySOLAR `0x3f9a...`; if you use that desk, the writer must hold that ySOLAR token.

---

## 2. Pre-requisites for `writeOption` to succeed

The **writer** (account from `HEDERA_OPERATOR_KEY` / `WRITER_PRIVATE_KEY`) must:

1. Hold enough **ySOLAR** (the token the desk uses).
2. Have **approved** the HederaOptionsDesk contract to spend that ySOLAR.
3. The **desk** must have enough HBAR for scheduled execution (script or manual fund).

**Important:** Use **matching** token and desk addresses. The desk in `docs/deployed-addresses.json` uses ySOLAR from that same file. Do not set only `HEDERA_YSOLAR_ADDRESS` (e.g. a different token) while using the repo’s desk, or `transferFrom` will fail. Either use **both** from the manifest, or set **both** `HEDERA_YSOLAR_ADDRESS` and `HEDERA_OPTIONS_DESK_ADDRESS` for your own deployment.

**One-time setup:** Run the manual script to mint (if writer has MINTER_ROLE), approve, and optionally fund the desk:

```bash
cd packages/contracts-hedera
npx hardhat run scripts/manual-write-option.js --network hederaTestnet
```

---

## 3. Step-by-step test

### 3.0 One-time: manual writeOption (mint / approve / fund desk)

From repo root, ensure `.env` (or `packages/relayer-python/.env`) has `HEDERA_RPC_URL` and `HEDERA_OPERATOR_KEY`. Then:

```bash
cd packages/contracts-hedera
npx hardhat run scripts/manual-write-option.js --network hederaTestnet
```

This uses **manifest** addresses (ySOLAR and desk from `docs/deployed-addresses.json`) so token and desk match. It mints 100 ySOLAR to the writer (if they have MINTER_ROLE), approves 10k for the desk, funds the desk with 1 HBAR if needed, and writes one option. After this, the trading-api can submit more options until allowance/balance run out.

### 3.1 Trading API (order submission backend)

```bash
cd packages/trading-api
cp .env.example .env
# Edit .env and set:
#   HEDERA_RPC_URL=https://testnet.hashio.io/api
#   WRITER_PRIVATE_KEY=<paste your HEDERA_OPERATOR_KEY value>
#   (Optional) HEDERA_OPTIONS_DESK_ADDRESS=0x... if different from deployed-addresses.json

npm install
npm start
```

Server runs at **http://localhost:3001**. Check: `curl http://localhost:3001/health`.

### 3.2 AI Copilot

```bash
cd packages/ai-copilot
# In .env set:
#   HEDERA_API_BASE_URL=http://localhost:3001
#   HEDERA_MOCK=false
#   OPENAI_API_KEY=sk-...   (and USE_0G=false if you use OpenAI)
#   DEMO_WRITER_ADDRESS / DEMO_BUYER_ADDRESS if you want (or leave defaults)

source .venv/bin/activate   # or .venv\Scripts\activate on Windows
uvicorn main:app --reload --port 8000
```

### 3.3 Run the agent flow test (real Hedera submit)

With both servers running, in another terminal:

```bash
cd packages/ai-copilot
source .venv/bin/activate
HEDERA_MOCK=false python test_agent_flow.py
```

This will:

1. Run ASK and TRADE mode (OpenAI if `USE_0G=false`).
2. Extract an intent and save it.
3. Call **POST /intents/{id}/submit** → trading-api **POST /write-option** → real Hedera tx.

If the writer has no ySOLAR or no allowance, the test will get a failure from the trading-api (502 with revert reason); the flow is still validated.

### 3.4 Optional: manual curl test

**Chat (trade mode):**
```bash
curl -s -X POST http://localhost:8000/chat \
  -H "Content-Type: application/json" \
  -d '{"session_id":"s1","message":"Write a covered call 100 ySOLAR strike 50 expiry in 1 day","mode":"trade"}'
```

**Create intent** (use the JSON from the reply):
```bash
curl -s -X POST http://localhost:8000/intents \
  -H "Content-Type: application/json" \
  -d '{"writer":"<DEMO_WRITER_ADDRESS>","buyer":"<DEMO_BUYER_ADDRESS>","product":"covered_call","underlying":"ySOLAR","amount":100,"strike":50,"expiry":<unix_ts_30_days>}'
```

**Submit** (use returned `intent_id`):
```bash
curl -s -X POST http://localhost:8000/intents/<intent_id>/submit
```

---

## 4. Your env summary (for .env only)

- **trading-api `.env`:**  
  `HEDERA_RPC_URL`, `WRITER_PRIVATE_KEY` (or `HEDERA_OPERATOR_KEY`), optionally `HEDERA_OPTIONS_DESK_ADDRESS`.

- **ai-copilot `.env`:**  
  `HEDERA_API_BASE_URL=http://localhost:3001`, `HEDERA_MOCK=false`, plus OpenAI/0G and demo wallets as needed.

Keep keys in `.env` only; do not commit them.
