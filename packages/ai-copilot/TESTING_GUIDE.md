# Testing Guide: Agent Flow with OpenAI

This guide explains how to test the agent flow using OpenAI (since 0G is not configured).

## Setup

1. **Set OpenAI API Key in `.env`**:
   ```bash
   cd packages/ai-copilot
   cp .env.example .env
   # Edit .env and add:
   OPENAI_API_KEY=sk-proj-your-actual-key-here
   USE_0G=false  # Force OpenAI mode
   ```

2. **Install dependencies** (if not already done):
   ```bash
   python3 -m venv .venv
   source .venv/bin/activate
   pip install -r requirements.txt
   ```

## Quick Test

Run the simple test script:
```bash
python quick_test.py
```

This will:
- ✅ Test ASK mode (analytical questions)
- ✅ Test TRADE mode (intent extraction)
- ✅ Verify OpenAI client works

## Full Flow Test

Run the comprehensive test:
```bash
python test_agent_flow.py
```

This tests:
1. **ASK Mode**: Analytical conversation about covered calls and ySOLAR
2. **TRADE Mode**: Intent extraction from natural language
3. **Intent Save & Submit**: Saving intent and submitting to Hedera (mock mode)
4. **Mode Switching**: Context preservation when switching ASK → TRADE

## API Testing (with Server Running)

Start the server:
```bash
uvicorn main:app --reload --port 8000
```

### Test ASK Mode
```bash
curl -X POST http://localhost:8000/chat \
  -H 'Content-Type: application/json' \
  -d '{
    "session_id": "test-1",
    "message": "What is a covered call?",
    "mode": "ask"
  }'
```

### Test TRADE Mode
```bash
curl -X POST http://localhost:8000/chat \
  -H 'Content-Type: application/json' \
  -d '{
    "session_id": "test-1",
    "message": "I want to write a covered call: 1000 ySOLAR, strike 500, expiry in 30 days, writer 0x123, buyer 0xabc",
    "mode": "trade"
  }'
```

### Save Intent
```bash
curl -X POST http://localhost:8000/intents \
  -H 'Content-Type: application/json' \
  -d '{
    "writer": "0x1234567890123456789012345678901234567890",
    "buyer": "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
    "amount": 1000,
    "strike": 500,
    "expiry": 1735689600
  }'
```

### Submit Intent (Mock)
```bash
# Use the intent_id from the previous response
curl -X POST http://localhost:8000/intents/{intent_id}/submit
```

## Current Architecture

### Agent Flow
1. **POST /chat** → Agent processes message in ASK or TRADE mode
   - ASK mode: Returns analytical response
   - TRADE mode: Extracts JSON intent from natural language

2. **POST /intents** → Saves intent to in-memory store
   - Validates schema (amount > 0, strike > 0, expiry >= now + 180s)

3. **POST /intents/{id}/submit** → Submits to Hedera backend
   - Currently mocked (`HEDERA_MOCK=true`)
   - Returns mock tx hash: `mock-tx-0x123`

4. **GET /intents/{id}** → Retrieves intent status

### QuickNode Pricing (Not Integrated)

**Status**: QuickNode is marked as "not in scope" per README.

**Current Behavior**: 
- Agent extracts user-provided parameters (amount, strike, expiry)
- No real-time pricing data is fetched
- No market data validation beyond schema constraints

**To Add QuickNode Integration** (future work):
1. Create `services/pricing.py`:
   - Fetch ySOLAR price from QuickNode API
   - Fetch grid telemetry (wattage, battery %, weather)
   - Calculate implied volatility

2. Inject into agent prompts:
   - Add current price/telemetry to system prompts
   - Or pass as context in `AgentSession._build_messages()`

3. Validate against market:
   - Check strike vs current price
   - Warn if strike is far from market

## Expected Output

### ASK Mode Response
```json
{
  "session_id": "test-1",
  "mode": "ask",
  "content": "A covered call is a strategy where...",
  "intent": null
}
```

### TRADE Mode Response
```json
{
  "session_id": "test-1",
  "mode": "trade",
  "content": "{\"product\":\"covered_call\",\"amount\":1000,...}\n\nI've prepared your trade intent...",
  "intent": {
    "product": "covered_call",
    "underlying": "ySOLAR",
    "writer": "0x123...",
    "buyer": "0xabc...",
    "amount": 1000,
    "strike": 500,
    "expiry": 1735689600
  }
}
```

## Troubleshooting

### OpenAI Key Not Working
- Check `.env` file has `OPENAI_API_KEY` set
- Verify key is valid (starts with `sk-`)
- Check key has credits/quota

### 0G Still Being Used
- Set `USE_0G=false` in `.env`
- Or export: `export USE_0G=false`

### Intent Not Extracted
- TRADE mode requires very specific format
- Try: "I want to write a covered call: amount X, strike Y, expiry Z"
- Include all required fields: writer, buyer, amount, strike, expiry

### Hedera Submission Failing
- Check `HEDERA_MOCK=true` for mock mode
- Or set `HEDERA_API_BASE_URL` to actual backend URL
