#!/usr/bin/env bash
# Quick test of POST /write-option (trading-api must be running with .env set).
# Usage: ./test-write-option.sh [base_url]
# Example: ./test-write-option.sh http://localhost:3001

BASE="${1:-http://localhost:3001}"
# Buyer: use a placeholder; expiry 30 days from now
EXPIRY=$(($(date +%s) + 2592000))

echo "Health: $BASE/health"
curl -s "$BASE/health" | head -1
echo ""
echo "POST $BASE/write-option (buyer=0x0000000000000000000000000000000000000001, amount=100, strike=50, expiry=$EXPIRY)"
curl -s -X POST "$BASE/write-option" \
  -H "Content-Type: application/json" \
  -d "{\"buyer\":\"0x0000000000000000000000000000000000000001\",\"amount\":100,\"strike\":50,\"expiry\":$EXPIRY}"
echo ""
