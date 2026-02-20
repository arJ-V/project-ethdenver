"""
Test 0G connection with actual private key.
Tests client initialization and a minimal inference call.
"""
import os
import sys
from dotenv import load_dotenv

load_dotenv()

private_key = os.environ.get("A0G_PRIVATE_KEY", "")
rpc_url = os.environ.get("A0G_RPC_URL", "https://evmrpc-testnet.0g.ai")
provider = os.environ.get("A0G_PROVIDER_ADDRESS", "0xa48f01287233509FD694a22Bf840225062E67836")
model = os.environ.get("A0G_MODEL", "qwen-2.5-7b-instruct")

print("=" * 60)
print("Testing 0G Connection with Private Key")
print("=" * 60)

if not private_key or private_key == "your_wallet_private_key_hex":
    print("✗ A0G_PRIVATE_KEY not set in .env")
    sys.exit(1)

# Ensure 0x prefix
if not private_key.startswith("0x"):
    private_key = "0x" + private_key
    print(f"✓ Added 0x prefix to private key")

print(f"\nRPC URL: {rpc_url}")
print(f"Provider: {provider}")
print(f"Model: {model}")
print(f"Private Key: {private_key[:10]}...{private_key[-8:]} (masked)")

# Test 1: Try importing a0g
print("\n1. Checking a0g package...")
try:
    from a0g.base import A0G
    print("   ✓ a0g package found")
    a0g_available = True
except ImportError as e:
    print(f"   ✗ a0g package not available: {e}")
    print("   Trying to install...")
    import subprocess
    try:
        subprocess.check_call([sys.executable, "-m", "pip", "install", "-q", "git+https://github.com/DormintLab/python-0g"])
        from a0g.base import A0G
        print("   ✓ a0g package installed successfully")
        a0g_available = True
    except Exception as install_error:
        print(f"   ✗ Installation failed: {install_error}")
        print("\n   Note: a0g package may require Node.js")
        print("   Install Node.js first, then retry")
        a0g_available = False

if not a0g_available:
    print("\n" + "=" * 60)
    print("Fallback: Testing OpenAI-compatible client structure")
    print("=" * 60)
    print("\nSince a0g is not available, testing fallback path...")
    try:
        from openai import OpenAI
        from agents.client import get_0g_client
        
        # Force fallback
        os.environ["USE_0G"] = "false"
        client = get_0g_client()
        print("✓ Fallback OpenAI client works")
        print(f"  Client type: {type(client).__name__}")
        print("\nThe app will use OpenAI fallback until a0g is installed.")
        sys.exit(0)
    except Exception as e:
        print(f"✗ Fallback test failed: {e}")
        sys.exit(1)

# Test 2: Initialize A0G client
print("\n2. Initializing A0G client...")
try:
    a0g = A0G(
        private_key=private_key,
        rpc_url=rpc_url,
    )
    print("   ✓ A0G instance created")
    
    client = a0g.get_openai_client(provider)
    print("   ✓ OpenAI-compatible client obtained")
except Exception as e:
    print(f"   ✗ A0G client initialization failed: {e}")
    print(f"   Error type: {type(e).__name__}")
    sys.exit(1)

# Test 3: Minimal inference call
print("\n3. Testing minimal inference call...")
print(f"   Model: {model}")
print("   Message: 'Say hello'")
print("   Max tokens: 20")
try:
    response = client.chat.completions.create(
        model=model,
        messages=[{"role": "user", "content": "Say hello"}],
        max_tokens=20,
        temperature=0.7,
    )
    content = response.choices[0].message.content
    print(f"   ✓ Inference call successful!")
    print(f"   Response: {content}")
    
    # Test 4: Test our agent wrapper
    print("\n4. Testing agent client wrapper...")
    from agents.client import get_0g_client
    os.environ["USE_0G"] = "true"  # Force 0G mode
    os.environ["A0G_PRIVATE_KEY"] = private_key  # Ensure it's set
    agent_client = get_0g_client()
    print("   ✓ Agent wrapper works")
    print(f"   Client type: {type(agent_client).__name__}")
    
except Exception as e:
    print(f"   ✗ Inference call failed: {e}")
    print(f"   Error type: {type(e).__name__}")
    print("\n   Possible issues:")
    print("   - Provider endpoint not available")
    print("   - Model not available")
    print("   - Network/RPC issues")
    print("   - Insufficient balance for inference")
    print("\n   The app will still work with OpenAI fallback.")
    sys.exit(1)

print("\n" + "=" * 60)
print("✓ All tests passed!")
print("=" * 60)
print("\n0G connection is working. The agent can use 0G inference.")
print("To use in the app, ensure USE_0G=true (or unset, defaults to true)")
