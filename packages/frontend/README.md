# Frontend (Trader + Issuer)

React + TypeScript + Vite frontend for the hackathon demo.

## Views

- `Trader Terminal`: asset discovery, deep-dive telemetry, trade actions, AI copilot simulator, immutable ledger feed.
- `Issuer Portal`: minting vault and compliance/audit interface.

## Local run

```bash
cd packages/frontend
cp .env.example .env
npm install
npm run dev
```

## Environment

- `VITE_TELEMETRY_API_BASE_URL`: telemetry/RWA backend (default `http://localhost:8000`)
- `VITE_TRADING_API_BASE_URL`: trading-api backend (default `http://localhost:3001`)
- Optional single-origin proxy:
  - `VITE_API_BASE_URL` (used when both are served behind one host)
- Optional write auth:
  - `VITE_TRADING_API_KEY`

## Commands

- `npm run dev` - start Vite dev server
- `npm run build` - type-check and build
- `npm run lint` - run ESLint
