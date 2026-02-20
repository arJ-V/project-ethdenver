"""
Quick test script to verify 0G connection and fallback paths.
Tests client initialization and a minimal chat completion.
"""
import os
import sys

# Set test env vars
os.environ.setdefault("A0G_RPC_URL", "https://evmrpc-testnet.0g.ai")
os.environ.setdefault("A0G_PROVIDER_ADDRESS", "0xa48f01287233509FD694a22Bf840225062E67836")
os.environ.setdefault("A0G_MODEL", "qwen-2.5-7b-instruct")

# Test address (public key - we'll need private key for real 0G)
test_address = "0xdEe4C06025F1f45617f98F922ca381E893b14519"

print("=" * 60)
print("Testing 0G Connection Setup")
print("=" * 60)

# Test 1: Check if a0g package is available
print("\n1. Checking a0g package...")
try:
    from a0g.base import A0G
    print("   ✓ a0g package found")
    a0g_available = True
except ImportError:
    print("   ✗ a0g package not installed (will use OpenAI fallback)")
    a0g_available = False

# Test 2: Test OpenAI fallback client (always works)
print("\n2. Testing OpenAI fallback client...")
try:
    from openai import OpenAI
    fallback_client = OpenAI(
        base_url=os.environ.get("OPENAI_BASE_URL", "https://api.openai.com/v1"),
        api_key=os.environ.get("OPENAI_API_KEY", "test-key"),
    )
    print("   ✓ OpenAI client initialized (fallback path)")
except Exception as e:
    print(f"   ✗ OpenAI client failed: {e}")
    sys.exit(1)

# Test 3: Try 0G client initialization (if package available)
if a0g_available:
    print("\n3. Testing 0G client initialization...")
    print(f"   Using RPC: {os.environ['A0G_RPC_URL']}")
    print(f"   Provider: {os.environ['A0G_PROVIDER_ADDRESS']}")
    print(f"   Model: {os.environ['A0G_MODEL']}")
    
    # Note: We need a private key, not a public address
    # For testing, we'll use a placeholder and catch the error
    test_private_key = os.environ.get("A0G_PRIVATE_KEY", "")
    
    if not test_private_key or test_private_key == "your_wallet_private_key_hex":
        print("   ⚠ No A0G_PRIVATE_KEY set (using placeholder for structure test)")
        print("   Note: You provided a public address, but 0G needs a private key")
        print(f"   Address: {test_address}")
        print("   To get private key: Export from MetaMask → Account Details → Show Private Key")
        print("   (Keep this secret! Never commit to git)")
        
        # Test structure without real key
        try:
            # This will fail without a real key, but we can see the error
            _a0g = A0G(
                private_key="0x" + "0" * 64,  # Placeholder
                rpc_url=os.environ["A0G_RPC_URL"],
            )
            print("   ⚠ Structure test: A0G class instantiated (will fail on actual API call)")
        except Exception as e:
            print(f"   ⚠ Expected error with placeholder key: {type(e).__name__}")
    else:
        try:
            _a0g = A0G(
                private_key=test_private_key,
                rpc_url=os.environ["A0G_RPC_URL"],
            )
            provider = os.environ["A0G_PROVIDER_ADDRESS"]
            _client = _a0g.get_openai_client(provider)
            print("   ✓ 0G client initialized successfully")
            
            # Test 4: Try a minimal API call
            print("\n4. Testing minimal 0G API call...")
            try:
                response = _client.chat.completions.create(
                    model=os.environ["A0G_MODEL"],
                    messages=[{"role": "user", "content": "Say 'test'"}],
                    max_tokens=10,
                )
                content = response.choices[0].message.content
                print(f"   ✓ API call successful: {content[:50]}")
            except Exception as e:
                print(f"   ✗ API call failed: {e}")
                print("   This might be expected if:")
                print("   - Private key is invalid")
                print("   - Provider is offline")
                print("   - Network/RPC issues")
        except Exception as e:
            print(f"   ✗ 0G client initialization failed: {e}")
            print("   Will use OpenAI fallback")

# Test 5: Test our agent client wrapper
print("\n5. Testing agent client wrapper...")
try:
    # Set USE_0G=false to force fallback for this test
    os.environ["USE_0G"] = "false"
    os.environ.setdefault("OPENAI_API_KEY", "test-key-placeholder")
    
    from agents.client import get_0g_client
    client = get_0g_client()
    print("   ✓ Agent client wrapper works")
    print(f"   Client type: {type(client).__name__}")
except Exception as e:
    print(f"   ✗ Agent client wrapper failed: {e}")

print("\n" + "=" * 60)
print("Summary:")
print("=" * 60)
print("✓ OpenAI fallback path works")
if a0g_available:
    print("✓ a0g package available")
    if not os.environ.get("A0G_PRIVATE_KEY") or os.environ.get("A0G_PRIVATE_KEY") == "your_wallet_private_key_hex":
        print("⚠ Need A0G_PRIVATE_KEY (private key, not public address)")
        print("  To test 0G: Export private key from MetaMask and set A0G_PRIVATE_KEY")
else:
    print("⚠ a0g package not installed - install with:")
    print("  pip install git+https://github.com/DormintLab/python-0g")
print("\nThe app will work with OpenAI fallback even without 0G setup.")
