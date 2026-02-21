#!/usr/bin/env bash
# Run full agent E2E test. Start trading-api (port 3001) and ai-copilot (port 8000) first.
# Usage: from repo root: ./scripts/e2e-run-agent-test.sh
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "Checking services..."
if ! curl -sf http://localhost:3001/health >/dev/null; then
  echo "ERROR: trading-api not reachable at http://localhost:3001. Start it with: cd packages/trading-api && npm start"
  exit 1
fi
if ! curl -sf http://localhost:8000/health >/dev/null; then
  echo "ERROR: ai-copilot not reachable at http://localhost:8000. Start it with: cd packages/ai-copilot && source .venv/bin/activate && uvicorn main:app --port 8000"
  exit 1
fi
echo "trading-api and ai-copilot are up."
echo ""
cd packages/ai-copilot
if [ -d .venv ]; then
  source .venv/bin/activate
fi
HEDERA_MOCK=false python test_agent_flow.py
