# trading-api

Backend-for-frontend/API gateway for L2/L3 trading:

- command endpoint for covered-call writes
- read endpoints for option snapshots + lifecycle timeline
- lightweight indexer for ADI + Hedera events

## Quick start

```bash
cd packages/trading-api
npm install
cp .env.example .env
# Set WRITER_PRIVATE_KEY and optionally TRADING_API_KEY
npm start
```

## Endpoints

- `GET /health`
- `POST /write-option` (command path; optional API key)
- `GET /orders/:optionId` (on-chain snapshot + normalized timeline)
- `GET /orders?writer=&buyer=&status=`
- `GET /timeline/:optionId`
- `POST /admin/reindex` (optional API key)

## Auth placeholder

If `TRADING_API_KEY` is set, send:

`x-api-key: <TRADING_API_KEY>`

Required for:
- `POST /write-option`
- `POST /admin/reindex`

## Response envelopes

Success:

```json
{ "ok": true }
```

Error:

```json
{
  "ok": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human readable explanation",
    "details": {}
  }
}
```

## Env

See `.env.example` for complete values. Key variables:

- `HEDERA_RPC_URL`
- `ADI_RPC_URL`
- `HEDERA_MIRROR_BASE_URL`
- `WRITER_PRIVATE_KEY` or `HEDERA_OPERATOR_KEY`
- `HEDERA_OPTIONS_DESK_ADDRESS` (optional if manifest exists)
- `ADI_VAULT_ADDRESS` (optional if manifest exists)
- `TRADING_API_KEY` (optional)
- `READ_MODEL_FILE`
- `INDEXER_POLL_MS`
- `PORT`

## Integration contract docs

- `docs/trading-api-contract.md`
- `docs/frontend-integration-spec.md`
