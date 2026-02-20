#!/usr/bin/env python3
"""
Quick test of agent flow with OpenAI.
Run: python quick_test.py
"""
import os
import sys

# Force OpenAI mode
os.environ["USE_0G"] = "false"
os.environ["OPENAI_MODEL"] = os.environ.get("OPENAI_MODEL", "gpt-4o-mini")

# Load .env
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

# Check key
if not os.environ.get("OPENAI_API_KEY") or os.environ.get("OPENAI_API_KEY") in ("placeholder", "your_openai_api_key"):
    print("❌ Set OPENAI_API_KEY in .env file")
    print("   Example: OPENAI_API_KEY=sk-proj-...")
    sys.exit(1)

print("✅ OpenAI key found")
print(f"   Key: {os.environ['OPENAI_API_KEY'][:15]}...")
print()

# Import and test
from agents.agent import get_or_create_session

print("Testing ASK mode...")
session = get_or_create_session("test")
session.switch_mode("ask")
result = session.chat("What is a covered call?")
print(f"Response: {result['content'][:200]}...")
print("✅ ASK mode works!\n")

print("Testing TRADE mode...")
session.switch_mode("trade")
result = session.chat("I want to write a covered call: 1000 ySOLAR, strike 500, expiry in 30 days, writer 0x123, buyer 0xabc")
print(f"Response: {result['content'][:300]}...")
if result.get("intent"):
    print(f"✅ Intent extracted: {result['intent']}")
else:
    print("⚠️  No intent extracted")
print("\n✅ Basic flow works!")
