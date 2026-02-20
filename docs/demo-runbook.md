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

## 3) Contract walkthrough flow

1. Deploy `ADIAssetVault`.
2. Mint principal NFT to operator.
3. Lock asset to emit `AssetLocked` and `YieldMintRequested`.
4. Relayer consumes lock event and mints `ySOLAR`.
5. Deploy `YieldOracle`, `ySolarToken`, `HederaOptionsDesk`.
6. Writer approves and calls `writeOption` with 180+ second expiry.
7. Oracle pushes latest yield index right before expiry.
8. Scheduled settlement executes self-call into `settleOption`.
9. Observe `OptionSettled` or `CollateralReleased` / `CollateralSlashed`.

## 4) Demo script for judges (<3 mins)

1. Show real-time telemetry logs from relayer service.
2. Show `AssetLocked` transaction and mirrored event.
3. Show `writeOption` transaction creating settlement schedule.
4. Wait for compressed expiry window.
5. Show settlement execution and final event ledger status.
