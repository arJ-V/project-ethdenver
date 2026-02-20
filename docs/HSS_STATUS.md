# Hedera Schedule Service (HSS) Status

This document explains what is currently working, what is failing, and what remains for full HSS bounty compliance.

## Current State Summary

## Working
- `writeOption(...)` succeeds on Hedera testnet.
- Contract attempts schedule creation via HSS precompile (`0x16b`) during `writeOption(...)`.
- `SettlementScheduled` events are emitted with a non-zero schedule reference.
- Manual settlement through `executeScheduledSettlement(optionId)` works and produces correct final events.

## Not yet reliable
- Fully autonomous scheduled execution path (network-triggered callback at expiry) is not reliably firing in this environment.

## Why this matters
- Hedera bounty requires schedule creation from contract logic and execution as core product behavior.
- We currently satisfy the scheduling intent and event trace, but autonomous execution is still unstable and needs focused debugging.

## Implementation Notes (Current Contract)

File: `packages/contracts-hedera/contracts/HederaOptionsDesk.sol`

- Schedule is created in `_scheduleSettlement(...)` using `IHederaScheduleService.scheduleCall(...)`.
- Scheduled call target is `executeScheduledSettlement(optionId)`.
- `executeScheduledSettlement(...)` performs `this.settleOption(optionId)` so settlement authorization remains strict (`msg.sender == address(this)` inside `settleOption`).
- `scheduleRef` stores the returned schedule address packed into `bytes32`.

## Observed Testnet Behavior

- Schedule creation transaction succeeds.
- Final settlement does not always execute automatically by expiry.
- Manual trigger path succeeds, proving settlement logic itself is correct.

## Known Follow-Up Hypotheses

1. Additional schedule signing/authorization semantics may be required per payer/key type.
2. HSS execution timing and queue behavior on testnet may be delayed or inconsistent.
3. Gas/capacity or payer signature constraints may prevent execution despite schedule creation.

## Debug Checklist for HSS Owner

1. Confirm schedule object status directly via Mirror Node after `SettlementScheduled`.
2. Verify schedule has all required signatures/authorizations and payer readiness.
3. Validate `expirySecond`, `gasLimit`, and call data against current HIP-1215 docs.
4. Test with a minimal standalone HSS contract call example to isolate product logic from network behavior.
5. Once autonomous firing is confirmed, remove manual fallback from proof scripts.

## What judges can truthfully be told right now

- Contract-driven scheduling is implemented and visible on-chain.
- Settlement logic is correct and deterministic.
- Autonomous HSS execution is the final stability item currently being hardened.
