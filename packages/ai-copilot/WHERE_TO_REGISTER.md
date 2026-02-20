# Where to Register Your 0G Account

## Summary

Your account needs to be registered with the 0G inference broker before you can use inference services. Here are the places to check:

## 🔍 Where to Go

### 1. **0G Documentation Portal** (Start Here)
- **URL**: https://docs.0g.ai/
- **What to look for**: 
  - "Getting Started" section
  - "Account Setup" or "Account Registration"
  - "Inference Provider" documentation
- **Direct links**:
  - https://docs.0g.ai/build-with-0g/compute-network/provider
  - https://docs.0g.ai/developer-hub/building-on-0g/compute-network/inference

### 2. **0G Testnet Dashboard/Portal** (If Available)
- Check if there's a web interface for the Galileo testnet
- Look for account registration/login
- Connect your MetaMask wallet: `0xdEe4C06025F1f45617f98F922ca381E893b14519`

### 3. **0G GitHub Repository**
- **Repository**: https://github.com/0glabs/0g-serving-broker
- **What to check**:
  - README.md for setup instructions
  - Issues/discussions about account registration
  - Example scripts or documentation

### 4. **Use TypeScript SDK** (If you have Node.js)
The official 0G SDK is TypeScript-only. You can create a quick script:

```typescript
import { InferenceBroker } from '@0glabs/0g-ts-sdk';

const broker = new InferenceBroker({
  privateKey: 'YOUR_PRIVATE_KEY_HEX',  // From .env A0G_PRIVATE_KEY — never commit real key
  rpcUrl: 'https://evmrpc-testnet.0g.ai'
});

// This should register the account
await broker.addAccount();
```

### 5. **Direct Contract Call** (Advanced)
The broker contract is at: `0xE70830508dAc0A97e6c087c75f402f9Be669E406`

You can try calling the `addAccount()` method directly using web3 or ethers.js.

## 📋 Your Account Info

- **Address**: `0xdEe4C06025F1f45617f98F922ca381E893b14519`
- **Balance**: 0.1 ETH (sufficient for registration)
- **Network**: Galileo Testnet (Chain ID: 16602)
- **RPC**: https://evmrpc-testnet.0g.ai

## 🚀 Quick Test After Registration

Once registered, test with:

```bash
cd packages/ai-copilot
source .venv/bin/activate
python test_0g_with_key.py
```

If you see "✓ API call successful", you're good to go!

## 💡 Workaround Until Registered

The app works fine with OpenAI fallback:

1. Set `USE_0G=false` in `.env`
2. Optionally set `OPENAI_API_KEY` if you have one
3. The app will function normally

## 📞 Need Help?

- Check 0G Discord/Telegram (if available)
- Review 0G documentation
- Check GitHub issues for similar problems
