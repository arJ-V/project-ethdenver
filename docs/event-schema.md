# Event Schema

This document describes on-chain events used across the full application (ADI vault, Hedera options desk, relayer, trading-api, and frontend timeline). For system architecture, see `docs/architecture.md`.

---

## ADI (Vault) events

Emitted by `ADIAssetVault` on ADI. The relayer watches `YieldMintRequested` to trigger ySOLAR mints on Hedera.

### `AssetMinted`
- `assetId` (indexed `uint256`)
- `owner` (indexed `address`)

### `AssetLocked`
- `assetId` (indexed `uint256`)
- `owner` (indexed `address`)
- `expectedYieldKWh` (`uint256`)
- `lockTs` (`uint256`)

### `YieldMintRequested`
- `assetId` (indexed `uint256`)
- `expectedYieldKWh` (`uint256`)
- `beneficiary` (indexed `address`)

---

## Hedera (Options + Oracle) events

Emitted by `HederaOptionsDesk` and `YieldOracle` on Hedera. Used for timeline, settlement status, and UI state.

### YieldOracle

#### `YieldIndexUpdated`
- `roundId` (indexed `uint256`)
- `yieldIndex` (`uint256`)
- `updatedAt` (`uint256`)

### HederaOptionsDesk

#### `OptionWritten`
- `optionId` (indexed `uint256`)
- `writer` (indexed `address`)
- `buyer` (indexed `address`)
- `amount` (`uint256`)
- `strike` (`uint256`)
- `expiry` (`uint256`)

#### `CollateralLocked`
- `optionId` (indexed `uint256`)
- `writer` (indexed `address`)
- `amount` (`uint256`)

#### `SettlementScheduled`
- `optionId` (indexed `uint256`)
- `scheduleRef` (indexed `bytes32`)
- `expiry` (`uint256`)

#### `OptionSettled`
- `optionId` (indexed `uint256`)
- `buyer` (indexed `address`)
- `amount` (`uint256`)
- `oracleYieldIndex` (`uint256`)
- `oracleRoundId` (`uint256`)
- `oracleUpdatedAt` (`uint256`)

#### `CollateralReleased`
- `optionId` (indexed `uint256`)
- `writer` (indexed `address`)
- `amount` (`uint256`)
- `oracleYieldIndex` (`uint256`)
- `oracleRoundId` (`uint256`)
- `oracleUpdatedAt` (`uint256`)

#### `CollateralSlashed`
- `optionId` (indexed `uint256`)
- `buyer` (indexed `address`)
- `amount` (`uint256`)
- `oracleYieldIndex` (`uint256`)
- `oracleRoundId` (`uint256`)
- `oracleUpdatedAt` (`uint256`)

#### `SettlementFailed`
- `optionId` (indexed `uint256`)
- `reason` (`string`)
- `oracleRoundId` (`uint256`)
- `oracleUpdatedAt` (`uint256`)

#### `SettlementExecutionAttempt`
- `optionId` (indexed `uint256`)
- Emitted when the desk’s scheduled self-call runs (before success/failure outcome).

#### `SettlementFailureDetail`
- `optionId` (indexed `uint256`)
- Selector and calldata for low-level revert debugging.

---

## UI status mapping

Timeline and frontend map on-chain events to status labels:

| Status label  | On-chain event(s)                |
|---------------|-----------------------------------|
| `created`     | `OptionWritten`                   |
| `pending`     | `SettlementScheduled`             |
| `executed`    | `OptionSettled`, `CollateralReleased` |
| `failed`      | `SettlementFailed`                |
| `liquidated`  | `CollateralSlashed`               |

---

## Normalized timeline record (read API)

`trading-api` (and any timeline consumer) exposes entries in a normalized shape for the frontend and AI copilot:

- **`eventKey`**: idempotency key (e.g. `chainId:txHash:logIndex`)
- **`source`**: `adi` | `hedera`
- **`event`**: canonical on-chain event name
- **`optionId`**: nullable (ADI events are not option-bound)
- **`txHash`**, **`blockNumber`**, **`logIndex`**
- **`ts`**: ISO timestamp
- **`statusLabel`**: nullable; uses the UI status mapping above
