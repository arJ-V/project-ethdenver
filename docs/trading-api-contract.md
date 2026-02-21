# Trading API Contract (L2/L3)

This is the canonical command/query contract for frontend and AI agent integration.

## Submission Path

- Single command path for both UI and agent: `POST /write-option`
- OTC flow only (no orderbook in MVP)
- The backend writer key signs on Hedera in this phase

## Auth Placeholder

- If `TRADING_API_KEY` is set, clients must send `x-api-key: <value>` on:
  - `POST /write-option`
  - `POST /admin/reindex`
- Read endpoints are public in demo mode.

## Endpoints

### `POST /write-option`

Request body:

```json
{
  "buyer": "0xabc...",
  "amount": "1000",
  "strike": "500",
  "expiry": "1772000000"
}
```

Response:

```json
{
  "ok": true,
  "txHash": "0x...",
  "optionId": "12",
  "status": "created"
}
```

### `GET /orders/:optionId`

Response includes:
- on-chain option snapshot from `HederaOptionsDesk.options(optionId)`
- derived status label
- normalized timeline events

### `GET /orders?writer=&buyer=&status=`

Returns indexed orders with optional filters:
- `writer=<address>`
- `buyer=<address>`
- `status=created|pending|executed|failed|liquidated`

### `GET /timeline/:optionId`

Returns normalized timeline events for one option, including linked ADI-side events where address correlation exists.

## Structured Error Contract

All errors follow:

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

Common error codes:
- `AUTH_REQUIRED`
- `VALIDATION_ERROR`
- `CONFIG_MISSING_WRITER_KEY`
- `CONFIG_MISSING_DESK_ADDRESS`
- `READ_OPTION_FAILED`
- `WRITE_OPTION_FAILED`
- `CONTRACT_INVALID_EXPIRY` (and other decoded contract errors)

## Status Lifecycle Mapping

Canonical UI/agent status mapping:

- `created` <- `OptionWritten`
- `pending` <- `SettlementScheduled`
- `executed` <- `OptionSettled` OR `CollateralReleased`
- `failed` <- `SettlementFailed`
- `liquidated` <- `CollateralSlashed`

This mapping is the source of truth for frontend badges and timeline stage rendering.
