# 0G Account Registration Guide

## Current Status

Your account (`0xdEe4C06025F1f45617f98F922ca381E893b14519`) exists on-chain with 0.1 ETH balance, but needs to be registered with the 0G inference broker before you can use inference services.

## Error Message

```
Account does not exist. Please create an account first using "add-account"
```

## Registration Options

### Option 1: Use 0G Dashboard/Portal (Recommended)

1. **Visit 0G Documentation**: https://docs.0g.ai/
2. **Look for Account Registration**: Check the "Getting Started" or "Account Setup" sections
3. **Use Testnet Portal**: There may be a web interface for the Galileo testnet
4. **Connect Wallet**: Connect your MetaMask wallet with the address `0xdEe4C06025F1f45617f98F922ca381E893b14519`

### Option 2: Use 0G TypeScript SDK

The official 0G SDK is TypeScript-only. You can use it to register:

```typescript
import { InferenceBroker } from '@0glabs/0g-ts-sdk';

const broker = new InferenceBroker({
  privateKey: 'your-private-key',
  rpcUrl: 'https://evmrpc-testnet.0g.ai'
});

// Register account
await broker.addAccount();
```

### Option 3: Call Contract Directly

The error mentions "add-account" which suggests a contract method. You may need to:

1. **Find the Broker Contract**: The provider address is `0xa48f01287233509FD694a22Bf840225062E67836`
2. **Call `addAccount()` method**: This registers your address with the broker
3. **Fund the account**: After registration, add funds using `ledger.addLedger()`

### Option 4: Use Python Script (Attempt)

Try running the registration script:

```bash
cd packages/ai-copilot
source .venv/bin/activate
python register_0g_account.py
```

## Resources

- **0G Documentation**: https://docs.0g.ai/
- **Inference Provider Docs**: https://docs.0g.ai/build-with-0g/compute-network/provider
- **Inference SDK**: https://docs.0g.ai/developer-hub/building-on-0g/compute-network/sdk
- **GitHub**: https://github.com/0glabs/0g-serving-broker

## Current Workaround

Until the account is registered, the app will use **OpenAI fallback**:

1. Set `USE_0G=false` in `.env`
2. Optionally set `OPENAI_API_KEY` if you have one
3. The app will work normally, just using OpenAI instead of 0G

## After Registration

Once your account is registered:

1. Set `USE_0G=true` in `.env` (or remove the line, defaults to true)
2. Restart the app
3. Test with: `python test_0g_with_key.py`

## Quick Test

To check if registration worked:

```bash
cd packages/ai-copilot
source .venv/bin/activate
python test_0g_with_key.py
```

If you see "✓ API call successful", registration is complete!
