# Telemetry Handoff (QuickNode Integration)

This note is for the teammate owning Layer 1 telemetry/oracle ingestion.

## TL;DR
- Yes, telemetry is currently mocked in the relayer loop.
- The mock is intentional for end-to-end pipeline testing.
- Replace the mock function with QuickNode stream ingestion, keep the rest of the flow unchanged.

## Current Mocked Path

File: `packages/relayer-python/src/service.py`

- Function:
  - `ingest_telemetry_and_compute_index()`
- Behavior:
  - returns a deterministic pseudo-index from `time.time()`
  - used to push oracle updates in the same loop that processes ADI lock events

This mock lets us validate:
- ADI event subscription
- Hedera mint tx submission
- Oracle push transaction path
- downstream settlement logic expectations

## What to Replace

Replace only this part:
- `ingest_telemetry_and_compute_index()`

Keep these parts:
- idempotency key generation (`blockNumber:txHash:logIndex`)
- `YieldMintRequested` processing
- `mint_ysolar_on_hedera(...)`
- `push_oracle_update(...)`
- persistent processed-event state file

## Expected QuickNode Integration Contract

Target output of telemetry layer should be a single numeric `yieldIndex` value at runtime:

```python
yield_index: int
```

Whether sourced from webhook push, polling, or stream consumer is up to implementation; the relayer only requires the derived index.

## Suggested Integration Shape

1. Parse QuickNode telemetry payload.
2. Normalize fields (`wattage`, degradation, weather inputs, etc.).
3. Compute deterministic `yieldIndex` (document formula in comments).
4. Return latest index to existing relayer loop.

Optional:
- add stale-data guard (max telemetry age)
- add simple in-memory cache with timestamp

## Interface Expectations for Other Layers

- Oracle update timing must occur near settlement window to satisfy freshness checks in `HederaOptionsDesk`.
- `yieldIndex` must be monotonic or at least explainable for demo clarity.
- Log each telemetry-to-index conversion for auditability in demo.

## Demo Guidance

During demo, you can explicitly state:
- "Telemetry feed is live from QuickNode; relayer converts to a yield index and writes it to the on-chain oracle."
- "The options desk settles using that latest on-chain index, not static hardcoded prices."
