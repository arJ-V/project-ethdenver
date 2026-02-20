# contracts-hedera

Hedera-side Solidity contracts for yield tokenization and options clearing.

## Contracts

- `contracts/ySolarToken.sol`
  - ERC-20 yield token (`1 ySOLAR = 1 kWh expected yield`)
- `contracts/YieldOracle.sol`
  - admin-push oracle with `roundId` and `updatedAt`
- `contracts/HederaOptionsDesk.sol`
  - OTC covered calls
  - schedule-at-write flow
  - self-call settlement authorization
  - stale oracle safeguards

## Commands

- `npm run compile -w contracts-hedera`
- `npm run test -w contracts-hedera`
- `npm run demo:settle -w contracts-hedera`
