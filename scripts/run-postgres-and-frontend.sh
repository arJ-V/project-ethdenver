#!/usr/bin/env bash
# Start Postgres + SolarTick backend, seed one RWA, then print how to run the frontend.
# Usage: from repo root: ./scripts/run-postgres-and-frontend.sh
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

BACKEND_URL="${BACKEND_URL:-http://localhost:8000}"
SOLARTICK_DIR="${SOLARTICK_DIR:-solartick}"

echo "== Starting Postgres + SolarTick backend..."
cd "$ROOT/$SOLARTICK_DIR"
docker compose up -d db backend
cd "$ROOT"

echo "== Waiting for backend to be healthy..."
for i in {1..30}; do
  if curl -sf "$BACKEND_URL/health" >/dev/null 2>&1; then
    echo "   Backend is up at $BACKEND_URL"
    break
  fi
  if [ "$i" -eq 30 ]; then
    echo "   Timeout waiting for backend. Check: docker compose -f $SOLARTICK_DIR/compose.yml logs backend"
    exit 1
  fi
  sleep 1
done

echo "== Creating one RWA (50_000 KWH) so the frontend has data..."
RWA_RESP=$(curl -sf -X POST "$BACKEND_URL/api/rwa" \
  -H "Content-Type: application/json" \
  -d '{"kwh": 50000}')
if command -v jq >/dev/null 2>&1; then
  RWA_ID=$(echo "$RWA_RESP" | jq -r '.rwa_adi_id')
else
  RWA_ID=$(echo "$RWA_RESP" | grep -o '"rwa_adi_id":[0-9]*' | cut -d: -f2)
fi
echo "   Created RWA with rwa_adi_id=$RWA_ID"

echo ""
echo "== Postgres + backend are running. Start the frontend in another terminal:"
echo ""
echo "   cd packages/frontend"
echo "   NEXT_PUBLIC_SOLARTICK_API_URL=$BACKEND_URL npm run dev"
echo ""
echo "Then open: http://localhost:3000/terminal"
echo "  - Asset Discovery should list RWA-$RWA_ID"
echo "  - Select it to see the pricing chart (RWA time-series)"
echo "  - Immutable Stream bar uses GET /api/rwa/feed"
echo ""
