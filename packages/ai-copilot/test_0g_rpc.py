"""
Test 0G RPC endpoint connectivity (cheap test without private key).
Tests if we can reach the 0G testnet RPC endpoint.
"""
import httpx
import os

RPC_URL = os.environ.get("A0G_RPC_URL", "https://evmrpc-testnet.0g.ai")
test_address = "0xdEe4C06025F1f45617f98F922ca381E893b14519"

print("=" * 60)
print("Testing 0G RPC Endpoint Connectivity")
print("=" * 60)
print(f"\nRPC URL: {RPC_URL}")
print(f"Test Address: {test_address}\n")

# Test 1: Basic RPC endpoint reachability
print("1. Testing RPC endpoint reachability...")
try:
    async def test_rpc():
        async with httpx.AsyncClient(timeout=10.0) as client:
            # Try a simple eth_blockNumber call (read-only, no auth needed)
            payload = {
                "jsonrpc": "2.0",
                "method": "eth_blockNumber",
                "params": [],
                "id": 1
            }
            response = await client.post(RPC_URL, json=payload)
            response.raise_for_status()
            data = response.json()
            if "result" in data:
                block_num = int(data["result"], 16)
                print(f"   ✓ RPC endpoint reachable")
                print(f"   ✓ Current block: {block_num}")
                return True
            else:
                print(f"   ⚠ RPC responded but no result: {data}")
                return False
    import asyncio
    result = asyncio.run(test_rpc())
except Exception as e:
    print(f"   ✗ RPC endpoint test failed: {e}")
    result = False

# Test 2: Check address balance (read-only, no private key needed)
if result:
    print("\n2. Testing address query (read-only)...")
    try:
        async def test_balance():
            async with httpx.AsyncClient(timeout=10.0) as client:
                payload = {
                    "jsonrpc": "2.0",
                    "method": "eth_getBalance",
                    "params": [test_address, "latest"],
                    "id": 2
                }
                response = await client.post(RPC_URL, json=payload)
                response.raise_for_status()
                data = response.json()
                if "result" in data:
                    balance_wei = int(data["result"], 16)
                    balance_eth = balance_wei / 1e18
                    print(f"   ✓ Address query successful")
                    print(f"   Balance: {balance_eth:.6f} ETH (or native token)")
                    return True
                else:
                    print(f"   ⚠ Query responded but no result: {data}")
                    return False
        asyncio.run(test_balance())
    except Exception as e:
        print(f"   ⚠ Balance query failed: {e}")

print("\n" + "=" * 60)
print("Summary:")
print("=" * 60)
if result:
    print("✓ 0G RPC endpoint is reachable")
    print("✓ Network connectivity works")
    print("\n⚠ To use 0G inference, you need:")
    print("  1. Private key (not public address)")
    print("     Export from MetaMask: Account → Details → Show Private Key")
    print("     Format: hex string starting with 0x (64 chars after 0x)")
    print("  2. Set A0G_PRIVATE_KEY in .env")
    print("  3. Install a0g package: pip install git+https://github.com/DormintLab/python-0g")
    print("\n⚠ Keep private key SECRET - never commit to git!")
else:
    print("✗ RPC endpoint not reachable")
    print("  Check network connection or RPC URL")

print(f"\nYour address: {test_address}")
print("This is a PUBLIC address - safe to share")
print("Private key is needed for signing transactions/inference calls")
