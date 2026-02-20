# contracts-adi

Generic EVM Solidity contracts and tests for ADI custody.

## Contracts

- `contracts/ADIAssetVault.sol`
  - ERC-721 principal vault
  - emits `AssetLocked` and `YieldMintRequested`
  - role-based admin controls

## Commands

- `npm run compile -w contracts-adi`
- `npm run test -w contracts-adi`
- `npm run demo:lock -w contracts-adi`
