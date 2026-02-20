# HSS Test Script Explanation - For Debugging

This document explains everything the `prove-hss-loop.js` script does, including configurations, addresses, and the complete flow.

## Overview

The script tests the Hedera Schedule Service (HSS) integration by:
1. Creating an option via `writeOption()`
2. Waiting for autonomous scheduled settlement execution
3. Verifying the settlement completes correctly

## Configuration

### Network Configuration
- **Network**: Hedera Testnet
- **Chain ID**: 296
- **RPC URL**: `https://testnet.hashio.io/api` (from `.env`)

### Deployed Contract Addresses

From `docs/deployed-addresses.json` (example structure - actual addresses will vary):

```json
{
  "hedera": {
    "network": "hederaTestnet",
    "chainId": 296,
    "deployer": "0x...",
    "ySolarAddress": "0x...",
    "oracleAddress": "0x...",
    "optionsDeskAddress": "0x..."
  }
}
```

**Note**: The actual deployed addresses are stored in `docs/deployed-addresses.json` which is gitignored. Deploy contracts to get your own addresses.

### Operator Account
- **Address**: Loaded from signer (from `HEDERA_OPERATOR_KEY` env var)
- **Private Key**: From `HEDERA_OPERATOR_KEY` env var (not shown for security)
- **HBAR Balance**: Should have sufficient HBAR for testing

## Complete Test Flow

### Step 1: Initialization
1. Loads deployment manifest from `docs/deployed-addresses.json` (gitignored - contains your deployed addresses)
2. Connects to deployed contracts using addresses from the manifest
3. Checks writer account HBAR balance

### Step 2: Contract HBAR Funding
**Why**: The contract needs HBAR to pay for scheduled execution fees (our HSS fix uses `scheduleCallWithPayer` with contract as payer).

**What happens**:
1. Checks if contract has sufficient HBAR (minimum: 1 HBAR = 1,000,000,000 tinybars)
2. If not, sends 2 HBAR from writer account to contract
3. Verifies funding succeeded

**Current Status**: Contract starts with 0 HBAR, gets funded to 2 HBAR

### Step 3: Option Parameters Setup
- **Buyer**: Same as writer (uses writer address) - for simplicity
- **Amount**: 1,000 ySOLAR tokens
- **Strike**: 500 (yield index threshold)
- **Expiry**: Current timestamp + 150 seconds (must be >= 120 seconds minimum)

### Step 4: Token Minting
**Transaction**: `ySolar.mint(writer.address, 1000)`
- Mints 1,000 ySOLAR tokens to writer account
- Writer needs tokens to use as collateral for the option

### Step 5: Token Approval
**Transaction**: `ySolar.approve(desk.address, 1000)`
- Approves the OptionsDesk contract to spend 1,000 ySOLAR from writer account
- Required for `transferFrom` in `writeOption()`

### Step 6: Write Option (THE CRITICAL STEP - CURRENTLY FAILING)

**Transaction**: `desk.writeOption(buyer, 1000, 500, expiry)`

**What `writeOption()` does internally**:
1. Validates inputs (buyer != address(0), amount > 0, strike > 0, expiry >= now + 120)
2. Transfers 1,000 ySOLAR from writer to contract (collateral lock)
3. **Calls `_scheduleSettlement()`** - THIS IS WHERE IT FAILS

**What `_scheduleSettlement()` does**:
```solidity
function _scheduleSettlement(uint256 optionId, uint256 expiry) internal returns (bytes32 scheduleRef) {
    // Skip HSS on local hardhat (chainid 31337)
    if (block.chainid == 31337) {
        return keccak256(abi.encodePacked(block.chainid, optionId, expiry, "LOCAL_DEV"));
    }

    // Encode the call to executeScheduledSettlement(optionId)
    bytes memory callData = abi.encodeCall(this.executeScheduledSettlement, (optionId));
    
    // Call HSS precompile at address 0x16b
    (int64 code, address scheduleAddress) = IHederaScheduleService(HSS_PRECOMPILE).scheduleCallWithPayer(
        address(this),  // to: contract will be called
        address(this),  // payer: contract pays for execution (must have HBAR)
        expiry,         // expirySecond: when to execute (Unix timestamp)
        SCHEDULE_GAS_LIMIT,  // gasLimit: 1,200,000
        0,              // value: 0 HBAR sent with call
        callData        // callData: encoded executeScheduledSettlement(optionId)
    );

    // Check if schedule creation succeeded
    if (code != HEDERA_SUCCESS || scheduleAddress == address(0)) {
        revert HssScheduleFailed(code);
    }

    // Authorize the schedule
    int64 authCode = IHederaScheduleService(HSS_PRECOMPILE).authorizeSchedule(scheduleAddress);
    if (authCode != HEDERA_SUCCESS) {
        revert HssScheduleFailed(authCode);
    }

    // Grant role to schedule address
    _grantRole(SETTLEMENT_EXECUTOR_ROLE, scheduleAddress);
    
    // Return schedule reference
    scheduleRef = bytes32(uint256(uint160(scheduleAddress)));
}
```

**Constants**:
- `HSS_PRECOMPILE = address(0x16b)` - Hedera Schedule Service system contract
- `HEDERA_SUCCESS = 22` - Expected success response code
- `SCHEDULE_GAS_LIMIT = 1,200,000` - Gas limit for scheduled execution

**Current Error**: 
```
ProviderError: execution reverted: CONTRACT_REVERT_EXECUTED
```

This happens at the `scheduleCallWithPayer` call. Possible causes:
1. `scheduleCallWithPayer` function doesn't exist or has different signature
2. Contract doesn't have sufficient HBAR (but we just funded it)
3. Authorization/permission issue
4. Invalid parameters (expiry, gasLimit, etc.)
5. HSS precompile not available or different on this Hedera version

### Step 7: Oracle Update
**Transaction**: `oracle.pushYieldIndex(700)`
- Pushes yield index of 700 to oracle
- Must be done before expiry for settlement to work
- Oracle freshness window: expiry - 300s to expiry + 600s

### Step 8: Wait for Settlement
- Polls for settlement events every 5 seconds
- Looks for:
  - `OptionSettled` - successful ITM settlement
  - `CollateralReleased` - successful OTM settlement  
  - `SettlementFailed` - settlement failed
  - `SettlementExecutionAttempt` - settlement was attempted
  - `SettlementFailureDetail` - detailed failure info
- Timeout: 4 minutes

### Step 9: Verify Results
- Checks final option status (should be 2=Settled or 3=Slashed)
- Verifies token balances
- Shows all events emitted

## Contract Code Reference

### HederaOptionsDesk Contract
- **File**: `packages/contracts-hedera/contracts/HederaOptionsDesk.sol`
- **Key Functions**:
  - `writeOption()` - Creates option and schedules settlement
  - `executeScheduledSettlement()` - Entry point for scheduled execution
  - `settleOption()` - Performs actual settlement logic
  - `_scheduleSettlement()` - Creates HSS schedule (FAILING HERE)

### HSS Interface
```solidity
interface IHederaScheduleService {
    function authorizeSchedule(address scheduleAddress) external returns (int64 responseCode);
    
    function scheduleCall(
        address to,
        uint256 expirySecond,
        uint256 gasLimit,
        uint64 value,
        bytes calldata callData
    ) external returns (int64 responseCode, address scheduleAddress);
    
    function scheduleCallWithPayer(
        address to,
        address payer,
        uint256 expirySecond,
        uint256 gasLimit,
        uint64 value,
        bytes calldata callData
    ) external returns (int64 responseCode, address scheduleAddress);
}
```

## Environment Variables

From `packages/relayer-python/.env` (example - use your own values):
```
HEDERA_OPERATOR_ID=0.0.XXXXXXX
HEDERA_OPERATOR_KEY=<your-private-key-here>
HEDERA_RPC_URL=https://testnet.hashio.io/api
HEDERA_NETWORK=testnet
```

## How to Run

```bash
cd packages/contracts-hedera
npm run prove:hss
```

This runs:
```bash
hardhat run scripts/prove-hss-loop.js --network hederaTestnet
```

## Current Issue Summary

**Problem**: `writeOption()` fails with `CONTRACT_REVERT_EXECUTED` when calling `scheduleCallWithPayer()`

**Location**: `HederaOptionsDesk._scheduleSettlement()` line ~291

**What we've verified**:
- ✅ Contract has HBAR (2 HBAR funded)
- ✅ Writer has tokens and approval
- ✅ Parameters are valid (expiry > now + 120)
- ✅ Network connection works (other calls succeed)

**What we need to debug**:
- ❓ Does `scheduleCallWithPayer` exist on Hedera testnet?
- ❓ What is the exact error code/reason from HSS?
- ❓ Are the parameters correct for `scheduleCallWithPayer`?
- ❓ Should we use `scheduleCall` instead (without payer)?
- ❓ Is there a different way to specify the payer?

## Debugging Suggestions

1. **Try `scheduleCall` instead of `scheduleCallWithPayer`**:
   - The original code used `scheduleCall` which defaults to transaction originator as payer
   - Maybe `scheduleCallWithPayer` isn't available yet

2. **Check HSS documentation**:
   - Verify function signature matches Hedera's implementation
   - Check if payer needs to be authorized differently

3. **Add more error handling**:
   - Try to decode the revert reason
   - Check the response code from HSS

4. **Test with simpler parameters**:
   - Try different gas limits
   - Try different expiry times
   - Try without authorization step

5. **Check Hedera network status**:
   - Verify HSS is available on testnet
   - Check if there are any network-specific requirements

## Expected Success Flow

If everything works:
1. `writeOption()` succeeds and emits `OptionWritten` and `SettlementScheduled` events
2. Schedule is created with non-zero `scheduleRef`
3. At expiry time, HSS automatically calls `executeScheduledSettlement(optionId)`
4. Settlement executes and emits `OptionSettled` or `CollateralReleased`
5. Token balances update correctly

## Files Involved

- **Test Script**: `packages/contracts-hedera/scripts/prove-hss-loop.js`
- **Contract**: `packages/contracts-hedera/contracts/HederaOptionsDesk.sol`
- **Config**: `docs/deployed-addresses.json`
- **Env**: `packages/relayer-python/.env`
- **Hardhat Config**: `packages/contracts-hedera/hardhat.config.js`
