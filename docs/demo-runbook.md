# Demo Runbook

## Prerequisites

- Node.js 20+
- Python 3.11+
- NPM workspaces enabled

## 1) Install dependencies

```bash
npm install
```

```bash
cd packages/relayer-python
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cd ../../
```

## 2) Run tests

```bash
npm run test
```

## 3) Preflight gate check

```bash
npm run preflight
```

Gate A passes only when both ADI and Hedera balances are non-zero for the deployer address.

## 4) Deploy contracts to testnets

```bash
npm run deploy:adi
npm run deploy:hedera
```

Deployment output is written to:

- `docs/deployed-addresses.json`

## 5) Contract walkthrough flow

1. Deploy `ADIAssetVault`.
2. Mint principal NFT to operator.
3. Lock asset to emit `AssetLocked` and `YieldMintRequested`.
4. Relayer consumes lock event and mints `ySOLAR`.
5. Deploy `YieldOracle`, `ySolarToken`, `HederaOptionsDesk`.
6. Writer approves and calls `writeOption` with 180+ second expiry.
7. Oracle pushes latest yield index right before expiry.
8. Scheduled settlement executes self-call into `settleOption`.
9. Observe `OptionSettled` or `CollateralReleased` / `CollateralSlashed`.

## 6) Demo script for judges (<3 mins)

1. Show real-time telemetry logs from relayer service.
2. In Issuer Portal, click `Create RWA` once (calls `POST /api/rwa/bootstrap`).
3. Confirm response metadata (`rwa_adi_id`, `asset_id`, `mint_tx_hash`, `lock_tx_hash`) and show `YieldMintRequested`/ySOLAR mint logs in relayer.
4. In Trader Terminal, select the new RWA and show moving price + yield charts.
5. Submit order via `trading-api` (`POST /write-option`) and show response `txHash + optionId`.
6. Show hybrid immutable stream entries (oracle updates + trade lifecycle events).
7. Wait for compressed expiry window and show `GET /timeline/:optionId` with terminal lifecycle event.

## 6.1) Frontend/Backend env wiring checklist

- `packages/frontend/.env`:
  - `VITE_TELEMETRY_API_BASE_URL=http://localhost:8000`
  - `VITE_TRADING_API_BASE_URL=http://localhost:3001`
  - `VITE_TRADING_API_KEY=<optional if trading-api enables API key>`
- `solartick/.env`:
  - `ADI_RPC_URL`, `ADI_VAULT_ADDRESS`, `ADI_OPERATOR_PRIVATE_KEY`, `RWA_DEFAULT_BENEFICIARY`
  - `MONAD_RPC_URL`, `PUBLISHER_PRIVATE_KEY`, `TELEMETRY_CONTRACT_ADDRESS`
  - `BACKEND_URL=http://backend:8000` (publisher RWA mode)
- `packages/relayer-python/.env`:
  - `DATABASE_URL`, `HEDERA_RPC_URL`, `HEDERA_YSOLAR_ADDRESS`, `ORACLE_CONTRACT_ADDRESS`
  - `ADI_RPC_URL`, `ADI_VAULT_ADDRESS`

## 6.2) Quick smoke test (operator)

1. `POST /api/rwa/bootstrap` with `{ "kwh": 12500 }` returns 201 and lock metadata.
2. `GET /api/rwas` contains the created RWA with non-null `asset_id` and `bootstrap_status = locked`.
3. Publisher emits telemetry with `site_id = rwa_adi_id`; webhook appends `rwa_timeseries`.
4. `GET /api/rwa/{id}/data` returns multiple points over ~20-40 seconds.
5. Trader Terminal shows chart movement and immutable stream entries tagged `[oracle]`.
6. `POST /write-option` succeeds and immutable stream also shows `[trade]` entries.

## 7) Frontend/API integration gates

- Gate A: ADI lock emits `YieldMintRequested`; relayer confirms mint + oracle push.
- Gate B: `POST /write-option` succeeds and returns `txHash` + `optionId`.
- Gate C: HSS emits terminal event (`OptionSettled`/`CollateralReleased`/`SettlementFailed`).
- Gate D: `GET /timeline/:optionId` contains ADI + Hedera lifecycle records.
- Gate E: AI agent uses the same command endpoint as frontend (no custom write path).

## Appendix

- HSS status and debugging notes: `docs/HSS_STATUS.md`
- Telemetry integration handoff: `docs/TELEMETRY_HANDOFF.md`
- API contract: `docs/trading-api-contract.md`
- Frontend integration spec: `docs/frontend-integration-spec.md`
- E2E gate evidence: `docs/e2e-gate-validation.md`
