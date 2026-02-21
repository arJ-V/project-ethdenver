# Telemetry Handoff (QuickNode Integration)

This note is for the teammate owning Layer 1 telemetry/oracle ingestion.

## TL;DR
- QuickNode webhook (FastAPI `/ingest/quicknode/streams`) writes telemetry to Postgres and enqueues a yield index to `oracle_pending_updates`.
- The relayer polls that table and pushes the index to the Hedera oracle; oracle updates are no longer mocked or tied to ADI logs.

## Current Integration (Webhook → Postgres Queue → Relayer → Hedera)

- **Backend** (`solartick/backend/ingest.py`): After inserting events into `telemetry_points`, computes one `yield_index` per webhook batch (formula: from last event’s `watt_hours`, clamped 100–999) and inserts one row into `oracle_pending_updates`.
- **Relayer** (`packages/relayer-python/src/service.py`): Each loop iteration (1) processes one pending row from `oracle_pending_updates`, pushes to Hedera via `pushYieldIndex`, then deletes the row; (2) optionally polls ADI for `YieldMintRequested` and mints ySOLAR only (no oracle push). Requires `DATABASE_URL` for the queue.

This lets us validate:
- ADI event subscription (when ADI_RPC_URL/ADI_VAULT_ADDRESS are set)
- Hedera mint tx submission
- Oracle push from webhook queue (Postgres → relayer → Hedera)
- Downstream settlement logic expectations

## Yield Index Formula

The backend computes a single `yield_index` per webhook batch from the last event’s `watt_hours`: `max(100, min(999, (watt_hours % 1000) + 100))`. One row per batch is inserted into `oracle_pending_updates`; the relayer consumes and pushes to Hedera, then deletes the row.

## Interface Expectations for Other Layers

- Oracle update timing must occur near settlement window to satisfy freshness checks in `HederaOptionsDesk`.
- `yieldIndex` must be monotonic or at least explainable for demo clarity.
- Log each telemetry-to-index conversion for auditability in demo.

## Demo Guidance

During demo, you can explicitly state:
- "Telemetry feed is live from QuickNode; relayer converts to a yield index and writes it to the on-chain oracle."
- "The options desk settles using that latest on-chain index, not static hardcoded prices."
