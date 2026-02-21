#!/usr/bin/env bash
# Call POST /write-option and print full JSON response (for debugging revert selector).
# Requires trading-api running. Uses same payload shape as ai-copilot (strike from Postgres if you set it).
BASE="${1:-http://localhost:3001}"
EXPIRY=$(($(date +%s) + 3600))
echo "POST $BASE/write-option"
echo "Payload: buyer=0x1234...0001, amount=100, strike=50000, expiry=$EXPIRY"
curl -s -X POST "$BASE/write-option" \
  -H "Content-Type: application/json" \
  -d "{\"buyer\":\"0x1234567890123456789012345678901234567890\",\"amount\":100,\"strike\":50000,\"expiry\":$EXPIRY}" | jq .
