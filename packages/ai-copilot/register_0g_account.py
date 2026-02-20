"""
Script to register your account with 0G inference broker.
Based on 0G documentation: accounts need to be registered and funded.
"""
import os
import sys
from dotenv import load_dotenv

load_dotenv()

private_key = os.environ.get("A0G_PRIVATE_KEY", "")
rpc_url = os.environ.get("A0G_RPC_URL", "https://evmrpc-testnet.0g.ai")
provider = os.environ.get("A0G_PROVIDER_ADDRESS", "0xa48f01287233509FD694a22Bf840225062E67836")

if not private_key or private_key == "your_wallet_private_key_hex":
    print("✗ A0G_PRIVATE_KEY not set in .env")
    sys.exit(1)

# Ensure 0x prefix
if not private_key.startswith("0x"):
    private_key = "0x" + private_key

print("=" * 60)
print("0G Account Registration")
print("=" * 60)
print(f"\nRPC URL: {rpc_url}")
print(f"Provider: {provider}")
print(f"Private Key: {private_key[:10]}...{private_key[-8:]} (masked)\n")

try:
    from a0g.base import A0G
    
    print("1. Initializing A0G client...")
    a0g = A0G(
        private_key=private_key,
        rpc_url=rpc_url,
    )
    print("   ✓ A0G instance created")
    
    print("\n2. Checking available methods...")
    # Check if there's an add_account or similar method
    methods = [m for m in dir(a0g) if 'account' in m.lower() or 'ledger' in m.lower() or 'add' in m.lower()]
    if methods:
        print(f"   Found methods: {', '.join(methods[:10])}")
    
    # Try to access the broker/ledger
    print("\n3. Attempting account registration...")
    try:
        # The a0g package might have a broker or ledger attribute
        if hasattr(a0g, 'broker'):
            broker = a0g.broker
            print("   ✓ Broker found")
            
            if hasattr(broker, 'ledger'):
                ledger = broker.ledger
                print("   ✓ Ledger found")
                
                # Try to add ledger (fund account)
                print("\n4. Adding funds to account (if needed)...")
                try:
                    # Check balance first
                    if hasattr(ledger, 'getBalance'):
                        balance = ledger.getBalance()
                        print(f"   Current balance: {balance}")
                    
                    # Add ledger (this registers/funds the account)
                    if hasattr(ledger, 'addLedger'):
                        print("   Calling ledger.addLedger()...")
                        result = ledger.addLedger()
                        print(f"   ✓ Account registration/funding initiated")
                        print(f"   Result: {result}")
                except Exception as e:
                    print(f"   ⚠ Ledger operation: {type(e).__name__}: {e}")
        else:
            print("   ⚠ Broker attribute not found")
            print("   Trying direct client initialization...")
            
            # Try getting the OpenAI client - this might trigger registration
            print("\n4. Getting OpenAI client (may trigger registration)...")
            try:
                client = a0g.get_openai_client(provider)
                print("   ✓ Client obtained - account may be auto-registered")
            except Exception as e:
                error_msg = str(e)
                if "add-account" in error_msg.lower() or "account does not exist" in error_msg.lower():
                    print(f"\n   ⚠ Account needs manual registration")
                    print(f"   Error: {error_msg}")
                    print("\n" + "=" * 60)
                    print("Manual Registration Steps:")
                    print("=" * 60)
                    print("\nBased on 0G documentation, you may need to:")
                    print("1. Visit 0G dashboard/portal (if available)")
                    print("2. Use 0G TypeScript SDK directly")
                    print("3. Call the broker contract's addAccount method")
                    print("\n0G Documentation:")
                    print("  https://docs.0g.ai/build-with-0g/compute-network/provider")
                    print("  https://docs.0g.ai/developer-hub/building-on-0g/compute-network/inference")
                    print("\nAlternative: Use OpenAI fallback until account is registered")
                    print("  Set USE_0G=false in .env")
                else:
                    raise
                    
    except Exception as e:
        print(f"   ✗ Registration attempt failed: {e}")
        print(f"   Error type: {type(e).__name__}")
        
except ImportError:
    print("✗ a0g package not installed")
    print("  Install with: pip install git+https://github.com/DormintLab/python-0g")
    sys.exit(1)
except Exception as e:
    print(f"✗ Error: {e}")
    print(f"  Error type: {type(e).__name__}")
    sys.exit(1)

print("\n" + "=" * 60)
print("Next Steps:")
print("=" * 60)
print("1. If registration succeeded, try running test_0g_with_key.py")
print("2. If registration failed, check 0G docs for manual steps")
print("3. Use OpenAI fallback (USE_0G=false) until account is registered")
