# ADI Vault + Hedera Clearinghouse MVP

Production-lite MVP for institutional RWA yield trading:
- ADI custody layer (ERC-721 principal vault)
- Hedera clearinghouse (covered-call desk + scheduled settlement)
- Unified Python relayer (telemetry + bridge + oracle push)

## Repository Layout

- `packages/contracts-adi`: ADI-side vault contracts and tests
- `packages/contracts-hedera`: Hedera-side token, oracle, and options contracts/tests
- `packages/relayer-python`: unified backend control-plane service
- `docs/architecture.md`: architecture and data flow
- `docs/event-schema.md`: lifecycle event schema
- `docs/demo-runbook.md`: demo and execution steps

## Quick Start

1. Install Node dependencies:
   - `npm install`
2. Run contract tests:
   - `npm run test`
3. Run ADI demo lock flow:
   - `npm run demo:lock -w contracts-adi`
4. Run Hedera options demo flow:
   - `npm run demo:settle -w contracts-hedera`
5. Start unified Python relayer:
   - `cd packages/relayer-python`
   - `python -m venv .venv && source .venv/bin/activate`
   - `pip install -r requirements.txt`
   - `cp .env.example .env`
   - `python -m src.service`

## Hedera Track Alignment

- Contract-driven scheduling is initiated in `writeOption`.
- One deterministic settlement path per option.
- Edge-case handling includes insufficient collateral and stale oracle data.
- Event lifecycle supports pending/executed/failed status tracking.

## ADI Track Alignment

- ADI primary execution layer for principal custody.
- RWA tokenization via ERC-721 position lock.
- Role-based controls, compliance placeholder (`onlyKYCd`), and audit logs.
- Extensible architecture for institutional operations.