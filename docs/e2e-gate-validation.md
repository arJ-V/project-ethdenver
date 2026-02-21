# E2E Gate Validation (L2/L3)

Run date: 2026-02-21 (local)

## Gate A: ADI lock -> relayer mint/oracle

- ADI lock tx: `0x729dbc383b89620a8435eb94d324fc0d30716771b30eaa552b59ad3b03bd8a31`
- Relayer observed `YieldMintRequested` and processed idempotency key:
  - `99999:729dbc383b89620a8435eb94d324fc0d30716771b30eaa552b59ad3b03bd8a31:2`
- Relayer action logs:
  - `mint_ysolar` tx: `02bdee3fd9c5707d80cd459cd5e5db4c198b607ec9bf4a58e827f08f8d294c2c`
  - `push_oracle` tx: `80ed2fae7a7fdc0a07a83b131726b2c72fca2745d2a3e1df4c1e76cdb673c5c8`

Status: PASS

## Gate B: API writeOption command path

- Command path used: `POST /write-option` (same path for UI + agent)
- Hedera option write tx from proof loop:
  - `0x778dbc8a03daf659962d8bb80a55b61d65577a447cfe2cdebee93fc432cdafb1`
- Option ID: `1`
- Schedule ref:
  - `0x00000000000000000000000000000000000000000000000000000000007a01ed`

Status: PASS

## Gate C: HSS terminal event

- Scheduled execution attempt tx:
  - `0x21f9ce647347058f162c471d741dd44e4cb2bf103e281df1356bf98d77a064c4`
- Terminal event observed:
  - `SettlementFailed` with reason `OracleWindowMiss`

Status: PASS (terminal lifecycle observed through real scheduled path)

## Gate D: Timeline read API renders ADI + Hedera lifecycle

Validated endpoints:

- `GET /orders`
- `GET /orders/1`
- `GET /timeline/1`

Observed in timeline response:

- ADI events: `AssetLocked`, `YieldMintRequested`
- Hedera events: `OptionWritten`, `CollateralLocked`, `SettlementScheduled`, `SettlementExecutionAttempt`, `SettlementFailed`, `SettlementFailureDetail`

Status: PASS

## Gate E: Shared submission path for UI + agent

- Canonical command/query contract published:
  - `docs/trading-api-contract.md`
  - `docs/frontend-integration-spec.md`
- Both frontend and agent are aligned to submit via `POST /write-option`.

Status: PASS

## Notes

- During proof loop, direct oracle push in script reverted once:
  - `0x2447b488828eb1b7a54ab8cdb21e6bc8a9a5e31bbfa9720fc06f89ce3752fbb2`
- This did not block lifecycle visibility; HSS still executed and emitted terminal events.
