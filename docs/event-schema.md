# Event Schema

## ADI Layer Events

### `AssetLocked`
- `assetId` (indexed `uint256`)
- `owner` (indexed `address`)
- `expectedYieldKWh` (`uint256`)
- `lockTs` (`uint256`)

### `YieldMintRequested`
- `assetId` (indexed `uint256`)
- `expectedYieldKWh` (`uint256`)
- `beneficiary` (indexed `address`)

## Hedera Layer Events

### `OptionWritten`
- `optionId` (indexed `uint256`)
- `writer` (indexed `address`)
- `buyer` (indexed `address`)
- `amount` (`uint256`)
- `strike` (`uint256`)
- `expiry` (`uint256`)

### `CollateralLocked`
- `optionId` (indexed `uint256`)
- `writer` (indexed `address`)
- `amount` (`uint256`)

### `SettlementScheduled`
- `optionId` (indexed `uint256`)
- `scheduleRef` (indexed `bytes32`)
- `expiry` (`uint256`)

### `OptionSettled`
- `optionId` (indexed `uint256`)
- `buyer` (indexed `address`)
- `amount` (`uint256`)
- `oracleYieldIndex` (`uint256`)
- `oracleRoundId` (`uint256`)
- `oracleUpdatedAt` (`uint256`)

### `CollateralReleased`
- `optionId` (indexed `uint256`)
- `writer` (indexed `address`)
- `amount` (`uint256`)
- `oracleYieldIndex` (`uint256`)
- `oracleRoundId` (`uint256`)
- `oracleUpdatedAt` (`uint256`)

### `CollateralSlashed`
- `optionId` (indexed `uint256`)
- `buyer` (indexed `address`)
- `amount` (`uint256`)
- `oracleYieldIndex` (`uint256`)
- `oracleRoundId` (`uint256`)
- `oracleUpdatedAt` (`uint256`)

### `SettlementFailed`
- `optionId` (indexed `uint256`)
- `reason` (`string`)
- `oracleRoundId` (`uint256`)
- `oracleUpdatedAt` (`uint256`)

## UI Status Mapping

- `created`: `OptionWritten`
- `pending`: `SettlementScheduled`
- `executed`: `OptionSettled` or `CollateralReleased`
- `failed`: `SettlementFailed`
- `liquidated`: `CollateralSlashed`

## Normalized Timeline Record (Read API)

`trading-api` emits timeline entries in a normalized shape for frontend and agent consumers:

- `eventKey`: idempotency key (`chainId:txHash:logIndex`)
- `source`: `adi` | `hedera`
- `event`: canonical on-chain event name
- `optionId`: nullable (ADI events can be unbound)
- `txHash`
- `blockNumber`
- `logIndex`
- `ts`: ISO timestamp
- `statusLabel`: nullable status projection using the mapping above
