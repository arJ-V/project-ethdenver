#!/usr/bin/env bash
# Create RWAs via SolarTick backend so the frontend has data to display.
# Usage: from repo root: ./scripts/seed-rwas.sh
#        or: BACKEND_URL=http://localhost:8002 ./scripts/seed-rwas.sh
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

BACKEND_URL="${BACKEND_URL:-http://localhost:8002}"

echo "== Checking backend at $BACKEND_URL..."
if ! curl -sf "$BACKEND_URL/health" >/dev/null 2>&1; then
  echo "   Backend not reachable. Start it first (e.g. cd solartick/backend && uvicorn main:app --port 8002)"
  exit 1
fi
echo "   Backend OK"

echo "== Creating RWAs..."
for kwh in 50000 75000 120000; do
  resp=$(curl -sf -X POST "$BACKEND_URL/api/rwa" \
    -H "Content-Type: application/json" \
    -d "{\"kwh\": $kwh}")
  if command -v jq >/dev/null 2>&1; then
    id=$(echo "$resp" | jq -r '.rwa_adi_id')
  else
    id=$(echo "$resp" | grep -o '"rwa_adi_id":[0-9]*' | cut -d: -f2)
  fi
  echo "   RWA created: rwa_adi_id=$id (kwh=$kwh)"
done

echo ""
echo "== Done. Refresh the terminal; you should see 3 RWAs in Asset Discovery."
echo "   List: curl -s $BACKEND_URL/api/rwas | jq"
