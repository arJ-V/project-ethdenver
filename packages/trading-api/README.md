# trading-api

HTTP API for order submission used by the **ai-copilot**. Exposes **POST /write-option** that calls `HederaOptionsDesk.writeOption(buyer, amount, strike, expiry)` on Hedera testnet using a configured writer wallet.

## Quick start

```bash
cd packages/trading-api
npm install
cp .env.example .env
# Edit .env: set WRITER_PRIVATE_KEY and optionally HEDERA_RPC_URL, HEDERA_OPTIONS_DESK_ADDRESS
npm start
```

- Listens on **http://localhost:3001** by default.
- Desk address is read from `docs/deployed-addresses.json` (key `hedera.optionsDeskAddress`) unless `HEDERA_OPTIONS_DESK_ADDRESS` is set in env.

## Endpoints

- **GET /health** — `{ "status": "ok", "service": "trading-api" }`
- **POST /write-option** — Submit a covered-call order.

### POST /write-option

**Body (JSON):**

| Field   | Type   | Required | Description                          |
|--------|--------|----------|--------------------------------------|
| buyer  | string | Yes      | Beneficiary address (hex)            |
| amount | number/string | Yes | ySOLAR notional (collateral locked)  |
| strike | number/string | Yes | Yield index threshold                |
| expiry | number/string | Yes | Unix timestamp (must be ≥ now + 120) |

**Response (2xx):** `{ "txHash": "...", "optionId": "..." }`  
**Errors:** 400 (validation), 502 (contract/revert), 503 (missing config).

The **writer** is the wallet derived from `WRITER_PRIVATE_KEY`; that account must hold enough ySOLAR and have approved the options desk.

## Env

| Variable | Description |
|----------|-------------|
| `HEDERA_RPC_URL` | Hedera testnet RPC (default: https://testnet.hashio.io/api) |
| `WRITER_PRIVATE_KEY` or `HEDERA_OPERATOR_KEY` | Writer wallet private key (hex) |
| `HEDERA_OPTIONS_DESK_ADDRESS` | Options desk contract address (optional if `docs/deployed-addresses.json` exists) |
| `PORT` | Server port (default: 3001) |

## Integration with ai-copilot

1. Start this service (e.g. `npm start` in `packages/trading-api`).
2. In `packages/ai-copilot`, set `.env`:  
   `HEDERA_API_BASE_URL=http://localhost:3001` and `HEDERA_MOCK=false`.
3. Agent flow: **POST /chat** (mode=trade) → extract intent → **POST /intents** (save intent) → **POST /intents/{id}/submit** (calls this API and returns `tx_hash`, `option_id`).
