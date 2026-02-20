# AI Trading Agent – Protocol & Order Submission Context

Context for the next branch: making the AI trading agent work with the existing trading protocol and order submission system.

---

## 1. Trading Protocol Summary

- **Product**: OTC **covered calls** on **ySOLAR** (yield token: 1 ySOLAR = 1 kWh expected yield).
- **No matching engine**: No on-chain order book or AMM. Orders are **direct OTC** creation via a single contract call.
- **Flow**: Writer locks full ySOLAR collateral → option stored → settlement **scheduled** via Hedera Schedule Service (HSS) → at expiry, settlement runs (buyer gets ySOLAR if yield ≥ strike, else writer gets collateral back).

**Relevant docs**: `docs/architecture.md`, `docs/event-schema.md`, `packages/ai-copilot/ORDER_SUBMISSION_GUIDE.md`.

---

## 2. On-Chain Entry Point: HederaOptionsDesk

**Contract**: `packages/contracts-hedera/contracts/HederaOptionsDesk.sol`  
**Deployed addresses**: `docs/deployed-addresses.json` (e.g. `hedera.optionsDeskAddress`).

### 2.1 Main function for AI-triggered orders

```solidity
function writeOption(
    address buyer,
    uint256 amount,
    uint256 strike,
    uint256 expiry
) external returns (uint256 optionId)
```

- **Caller** = writer (must have ySOLAR and must have approved the desk for `amount`).
- **buyer**: option beneficiary at settlement.
- **amount**: ySOLAR notional (collateral locked from writer).
- **strike**: yield index threshold; at settlement, if `yieldIndex >= strike` → buyer gets payout; else writer gets collateral back.
- **expiry**: Unix timestamp when the option expires and settlement is allowed.

**Constraints (enforced on-chain)**:
- `buyer != address(0)`
- `amount > 0`, `strike > 0`
- `expiry >= block.timestamp + MIN_EXPIRY` (MIN_EXPIRY = 120 seconds)
- Writer must have approved `HederaOptionsDesk` for `amount` of ySOLAR and have balance ≥ amount.

**Returns**: `optionId` (incremental). Same id is used for settlement and events.

### 2.2 What writeOption does internally

1. Validates inputs and pulls `amount` of ySOLAR from `msg.sender` (writer) to the contract.
2. Creates a **Hedera schedule** that at `expiry` will call `executeScheduledSettlement(optionId)` on this contract.
3. Stores `OptionPosition` (writer, buyer, amount, strike, expiry, scheduleRef, status = Written).
4. Emits: `OptionWritten`, `CollateralLocked`, `SettlementScheduled`.

**Settlement path**: Schedule triggers `executeScheduledSettlement(optionId)` → contract self-calls `settleOption(optionId)` (only allowed from `address(this)`). Settlement uses `YieldOracle.getLatest()` and pays buyer or returns collateral to writer depending on yield vs strike.

### 2.3 View / helpers useful for the agent

- `options(optionId)` → `(writer, buyer, amount, strike, expiry, scheduleRef, status)`.
- `nextOptionId` → next id to be assigned.
- `hasSufficientHbar()` → whether the desk has enough HBAR to pay for scheduled execution (needed on real Hedera; see HSS docs).
- **Constants**: `MIN_EXPIRY` (120), `ySolar` (token address), `yieldOracle` (oracle address).

**Option status enum**: `None`, `Written`, `Settled`, `Slashed`.

---

## 3. Order Submission System (Current State)

- **No backend order/intent API yet.** The relayer (`packages/relayer-python`) does **not** handle orders; it does ADI event relay, ySOLAR mint, and oracle push only.
- **Submission today**: Call `writeOption(...)` from a wallet that holds ySOLAR and has set allowance (e.g. via Ethers/viem + Hedera testnet RPC).

**Reference scripts** (show exact call pattern and preconditions):
- `packages/contracts-hedera/scripts/demo-write-and-settle.js` – minimal write + time warp + settle.
- `packages/contracts-hedera/scripts/test-order-submission.js` – deploy, mint, approve, check HBAR, then `desk.connect(writer).writeOption(buyer, amount, strike, expiry)`.
- `packages/contracts-hedera/scripts/prove-hss-loop.js` – full flow on testnet with `docs/deployed-addresses.json` (reads `hedera.optionsDeskAddress`, etc.).

**Preconditions for a successful writeOption**:
1. Writer has ySOLAR balance ≥ `amount`.
2. Writer has approved `HederaOptionsDesk` for ≥ `amount`.
3. On Hedera testnet: desk has sufficient HBAR for HSS (or schedule may not execute); see `hasSufficientHbar()` and `fundContract()` / `receive()`.

---

## 4. Events and Status Mapping (for agent UX / tracking)

From `docs/event-schema.md` and `ORDER_SUBMISSION_GUIDE.md`:

| Event                 | Meaning / status      |
|-----------------------|------------------------|
| `OptionWritten`       | Order confirmed        |
| `SettlementScheduled` | Pending settlement     |
| `OptionSettled`       | Settled (buyer paid)   |
| `CollateralReleased`  | Settled (writer refund)|
| `CollateralSlashed`   | Slashed (partial/full) |
| `SettlementFailed`    | Settlement failed      |

Agent can map: **created** → OptionWritten, **pending** → SettlementScheduled, **executed** → OptionSettled/CollateralReleased, **failed** → SettlementFailed, **liquidated** → CollateralSlashed.

---

## 5. Suggested MVP for AI Agent (from ORDER_SUBMISSION_GUIDE)

- **Off-chain intent layer**: Agent produces structured intents (e.g. writer, buyer, amount, strike, expiry); optional backend stores intents and status.
- **Submit**: Execute by calling `writeOption(buyer, amount, strike, expiry)` with the **writer’s** signer (user or agent-controlled key).
- **Validation before submit**: product = covered_call, expiry ≥ now + 180 (or ≥ now + MIN_EXPIRY), amount > 0, strike > 0; confirm writer has balance and allowance.
- **After submit**: Store tx hash and `optionId`; track status via contract events (and optional backend).

**Suggested API contract** (if you add a backend later):
- `POST /intents` – create/update intent
- `POST /intents/:id/submit` – run `writeOption(...)` and return tx + optionId
- `GET /intents/:id` – intent status + tx metadata
- `GET /orders/:optionId` – on-chain option snapshot (from `options(optionId)` + events)

---

## 6. Deployment and Network

- **Hedera testnet**: Addresses in `docs/deployed-addresses.json` (e.g. `ySolarAddress`, `oracleAddress`, `optionsDeskAddress`).
- **Deploy**: `npm run deploy:hedera` (see `docs/demo-runbook.md`).
- **Chain ID**: 296 (hederaTestnet in manifest).

---

## 7. What the AI Agent Must Do to “Work With This”

1. **Parse user intent** (e.g. natural language) into: writer (or “me”), buyer, amount, strike, expiry.
2. **Validate** against contract rules (MIN_EXPIRY, positive amount/strike, buyer != 0) and optionally check writer balance/allowance (read from chain).
3. **Submit**: Call `writeOption(buyer, amount, strike, expiry)` using the writer’s signer (Hedera/testnet RPC). Use `optionsDeskAddress` and ABI from `HederaOptionsDesk.sol`.
4. **Track**: Optionally listen for OptionWritten/SettlementScheduled/OptionSettled/CollateralReleased/SettlementFailed/CollateralSlashed and map to user-facing status.
5. **No matching engine**: Agent does not “place orders into a book”; it executes a single OTC trade per intent via `writeOption`.

---

## 8. Relevant Files Quick Reference

| Purpose                    | Path |
|---------------------------|------|
| Contract (writeOption, options, events) | `packages/contracts-hedera/contracts/HederaOptionsDesk.sol` |
| Order submission guide (MVP + intents)  | `packages/ai-copilot/ORDER_SUBMISSION_GUIDE.md` |
| Architecture & data flow   | `docs/architecture.md` |
| Event schemas & UI mapping | `docs/event-schema.md` |
| Deployed addresses         | `docs/deployed-addresses.json` |
| Demo runbook               | `docs/demo-runbook.md` |
| Minimal write + settle     | `packages/contracts-hedera/scripts/demo-write-and-settle.js` |
| Order submission test      | `packages/contracts-hedera/scripts/test-order-submission.js` |
| Testnet HSS flow           | `packages/contracts-hedera/scripts/prove-hss-loop.js` |
| HSS status / gotchas       | `docs/HSS_STATUS.md`, `docs/HSS_ISSUE_ANALYSIS.md` |

This should be enough context to implement the AI trading agent against the current protocol and order submission system on the next branch.
