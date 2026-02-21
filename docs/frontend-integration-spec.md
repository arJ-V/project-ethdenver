# Frontend + Agent Integration Spec

## One Path Rule

Both React UI and AI agent must submit orders through the same backend endpoint:

- `POST /write-option`

No direct contract writes from frontend in MVP.

## Frontend Responsibilities

- Capture order intent fields:
  - `buyer`
  - `amount`
  - `strike`
  - `expiry`
- Submit command via `POST /write-option`
- Read order state via:
  - `GET /orders/:optionId`
  - `GET /timeline/:optionId`
- Render lifecycle status with tx hash links.

## Agent Responsibilities

- Use the same command endpoint and payload schema as frontend.
- Do not bypass the API with direct RPC writes in MVP.
- Reuse API key auth header when enabled.

## UI Lifecycle Rendering

- `created`
- `pending`
- `executed`
- `failed`
- `liquidated`

Status source is normalized events from `trading-api` read-model, not local frontend inference.

## Minimal Polling Strategy

- Poll `GET /orders/:optionId` every 5 seconds until terminal state.
- In parallel, poll `GET /timeline/:optionId` every 5 seconds for event-by-event UX.
- Stop polling on terminal states:
  - `executed`
  - `failed`
  - `liquidated`

## Security and Demo Constraints

- `TRADING_API_KEY` is a placeholder control for demo safety.
- Backend private key remains server-side.
- Wallet-native user signing is post-hackathon scope.
