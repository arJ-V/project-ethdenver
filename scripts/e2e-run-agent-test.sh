#!/usr/bin/env bash
# Run full agent E2E test. Start trading-api (3001) and ai-copilot (8002) first; SolarTick (8000) optional for real strike.
# Usage: from repo root: ./scripts/e2e-run-agent-test.sh
# See docs/HEDERA_E2E_NOTES.md if submit fails (writer/desk alignment, etc.).
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

AI_COPILOT_PORT="${AI_COPILOT_PORT:-8002}"

SOLARTICK_PORT="${SOLARTICK_PORT:-8000}"
echo "Checking services..."
if ! curl -sf "http://localhost:${SOLARTICK_PORT}/health" >/dev/null; then
  echo "WARN: SolarTick backend not reachable at http://localhost:${SOLARTICK_PORT}. Strike will fall back to intent (no real price). Start with: cd solartick && docker compose up db backend -d"
else
  echo "SolarTick (price source): http://localhost:${SOLARTICK_PORT} OK"
fi
if ! curl -sf http://localhost:3001/health >/dev/null; then
  echo "ERROR: trading-api not reachable at http://localhost:3001. Start it with: cd packages/trading-api && npm start"
  exit 1
fi
if ! curl -sf "http://localhost:${AI_COPILOT_PORT}/health" >/dev/null; then
  echo "ERROR: ai-copilot not reachable at http://localhost:${AI_COPILOT_PORT}. Start it with: cd packages/ai-copilot && source .venv/bin/activate && uvicorn main:app --port ${AI_COPILOT_PORT}"
  exit 1
fi
echo "trading-api and ai-copilot are up (copilot on port ${AI_COPILOT_PORT})."
echo ""
cd packages/ai-copilot
if [ -d .venv ]; then
  source .venv/bin/activate
fi
HEDERA_MOCK=false python test_agent_flow.py
