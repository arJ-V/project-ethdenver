# AI Agent Order Submission Guide (MVP)

This document explains how orders are submitted today, and how to add a lightweight order book for the AI agent.

## Current Reality

- There is **no matching engine or on-chain order book** implemented yet.
- The current contracts support **OTC covered-call creation** directly via `writeOption(...)` on `HederaOptionsDesk`.
- This is intentional for MVP speed and institutional OTC-style flows.

## Current On-Chain Entry Point

Contract: `packages/contracts-hedera/contracts/HederaOptionsDesk.sol`

Main function for AI-triggered order submission:

- `writeOption(address buyer, uint256 amount, uint256 strike, uint256 expiry)`

What it does:

1. Validates order inputs (buyer, amount, strike, min expiry).
2. Locks full `ySOLAR` collateral from writer.
3. Stores option state.
4. Creates a settlement schedule reference.
5. Emits lifecycle events:
   - `OptionWritten`
   - `CollateralLocked`
   - `SettlementScheduled`

This means your AI agent can already submit executable orders by calling `writeOption(...)`.

## Suggested MVP Order Book Design (Off-Chain)

Use an off-chain order-intent table/service in the AI layer, then submit accepted orders on-chain.

Why off-chain first:

- Faster to ship in hackathon timeline.
- Avoids building AMM/order-matching contracts.
- Keeps Hedera contracts focused on custody, collateral, scheduling, settlement.

Recommended intent schema:

```json
{
  "intentId": "uuid",
  "writer": "0x...",
  "buyer": "0x...",
  "product": "covered_call",
  "underlying": "ySOLAR",
  "amount": "1000",
  "strike": "500",
  "expiry": 1730000000,
  "status": "draft|approved|submitted|confirmed|failed",
  "txHash": null
}
```

## AI Agent Integration Flow

1. Parse natural language prompt to structured intent.
2. Validate constraints before submit:
   - `product == covered_call`
   - `expiry >= now + 180`
   - `amount > 0`, `strike > 0`
3. Ensure writer has `ySOLAR` and approval set.
4. Call `writeOption(...)`.
5. Store tx hash and emitted `optionId`.
6. Track post-submit status via events.

## Minimal API Contract (for teammate)

Suggested backend endpoints:

- `POST /intents`
  - create/update order intent
- `POST /intents/:id/submit`
  - executes `writeOption(...)`
- `GET /intents/:id`
  - returns intent status + tx metadata
- `GET /orders/:optionId`
  - returns on-chain option snapshot

## Event-Driven Status Mapping

- `OptionWritten` -> `confirmed`
- `SettlementScheduled` -> `pending_settlement`
- `OptionSettled` or `CollateralReleased` -> `settled`
- `SettlementFailed` or `CollateralSlashed` -> `failed_or_slashed`

## What Is Not Built Yet

- On-chain order matching
- Multi-party orderbook depth/quotes
- RFQ negotiation rails
- Partial fill routing

For hackathon scope, AI agent should treat orderbook as an off-chain intent layer and settlement as on-chain truth.
