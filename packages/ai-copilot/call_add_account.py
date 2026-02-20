"""
Attempt to call the addAccount method on the 0G broker contract directly.
Based on the error, the broker contract is at 0xE70830508dAc0A97e6c087c75f402f9Be669E406
"""
import os
from dotenv import load_dotenv
from a0g.base import A0G

load_dotenv()

private_key = os.environ.get("A0G_PRIVATE_KEY", "")
rpc_url = os.environ.get("A0G_RPC_URL", "https://evmrpc-testnet.0g.ai")

# Broker contract address from the error
BROKER_CONTRACT = "0xE70830508dAc0A97e6c087c75f402f9Be669E406"

if not private_key or private_key == "your_wallet_private_key_hex":
    print("✗ A0G_PRIVATE_KEY not set in .env")
    exit(1)

if not private_key.startswith("0x"):
    private_key = "0x" + private_key

print("=" * 60)
print("Calling addAccount on 0G Broker Contract")
print("=" * 60)
print(f"\nBroker Contract: {BROKER_CONTRACT}")
print(f"RPC URL: {rpc_url}")
print(f"Private Key: {private_key[:10]}...{private_key[-8:]} (masked)\n")

try:
    a0g = A0G(private_key=private_key, rpc_url=rpc_url)
    w3 = a0g.get_w3(rpc_url)
    
    print("1. Getting contract instance...")
    # Try to get the contract ABI
    try:
        abi = a0g.get_abi(BROKER_CONTRACT)
        print(f"   ✓ Got contract ABI ({len(abi)} functions)")
        
        # Find addAccount method
        add_account_func = None
        for func in abi:
            if func.get('name') == 'addAccount' or func.get('name') == 'add_account':
                add_account_func = func
                break
        
        if add_account_func:
            print(f"   ✓ Found addAccount function")
            contract = w3.eth.contract(address=BROKER_CONTRACT, abi=abi)
            
            print("\n2. Calling addAccount()...")
            account = a0g.get_account()
            print(f"   Account address: {account.address}")
            
            # Build transaction
            try:
                tx = contract.functions.addAccount().build_transaction({
                    'from': account.address,
                    'nonce': w3.eth.get_transaction_count(account.address),
                    'gas': 200000,
                    'gasPrice': w3.eth.gas_price,
                })
                
                # Sign and send
                signed_tx = account.sign_transaction(tx)
                tx_hash = w3.eth.send_raw_transaction(signed_tx.rawTransaction)
                
                print(f"   ✓ Transaction sent: {tx_hash.hex()}")
                print(f"   Waiting for confirmation...")
                
                receipt = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=60)
                if receipt.status == 1:
                    print(f"   ✓ Transaction confirmed!")
                    print(f"   Block: {receipt.blockNumber}")
                    print(f"   Gas used: {receipt.gasUsed}")
                    print("\n✓ Account registration successful!")
                else:
                    print(f"   ✗ Transaction failed")
            except Exception as e:
                print(f"   ✗ Transaction failed: {e}")
                print(f"   Error type: {type(e).__name__}")
        else:
            print("   ⚠ addAccount function not found in ABI")
            print("   Available functions:")
            for func in abi[:10]:
                if func.get('type') == 'function':
                    print(f"     - {func.get('name')}")
    except Exception as e:
        print(f"   ✗ Could not get contract ABI: {e}")
        print(f"   Error type: {type(e).__name__}")
        print("\n   Alternative: Check 0G documentation for account registration")
        print("   https://docs.0g.ai/")
        
except Exception as e:
    print(f"✗ Error: {e}")
    print(f"  Error type: {type(e).__name__}")

print("\n" + "=" * 60)
print("Next Steps:")
print("=" * 60)
print("1. If registration succeeded, test with: python test_0g_with_key.py")
print("2. If it failed, check 0G docs or use OpenAI fallback (USE_0G=false)")
