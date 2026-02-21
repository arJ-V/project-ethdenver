#!/usr/bin/env bash
# Ensure Hedera testnet is deployed and env is wired for relayer + trading-api.
# Run from repo root. Requires HEDERA_OPERATOR_KEY (or WRITER_PRIVATE_KEY) in
# packages/relayer-python/.env and deployer account funded with HBAR.
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

MANIFEST="$ROOT/docs/deployed-addresses.json"

echo "=== Hedera testnet ensure ==="
echo ""

# 1) Preflight: balance check
echo "1. Preflight (Hedera + ADI balances)..."
node scripts/preflight-check.js || {
  echo "   Preflight failed. Set HEDERA_OPERATOR_KEY (or WRITER_PRIVATE_KEY) in packages/relayer-python/.env and fund the deployer with HBAR on Hedera testnet."
  exit 1
}
echo ""

# 2) Deploy if no manifest or hedera section incomplete
if [ ! -f "$MANIFEST" ]; then
  echo "2. No docs/deployed-addresses.json found. Deploying Hedera contracts..."
  npm run deploy:hedera
  echo ""
elif ! node -e "const m=require('$MANIFEST'); const h=m.hedera||{}; if(!h.optionsDeskAddress||!h.oracleAddress){ process.exit(1); }" 2>/dev/null; then
  echo "2. docs/deployed-addresses.json missing hedera.optionsDeskAddress or oracleAddress. Deploying Hedera contracts..."
  npm run deploy:hedera
  echo ""
else
  echo "2. docs/deployed-addresses.json present with Hedera addresses."
  echo ""
fi

# 3) Print env to set for relayer and trading-api
echo "3. Addresses (use these in .env files):"
node -e "
const m = require('$MANIFEST');
const h = (m && m.hedera) || {};
if (!h.oracleAddress || !h.optionsDeskAddress) {
  console.error('Manifest missing hedera.oracleAddress or optionsDeskAddress');
  process.exit(1);
}
console.log('  Relayer (packages/relayer-python/.env):');
console.log('    ORACLE_CONTRACT_ADDRESS=' + h.oracleAddress);
console.log('  Trading-api: uses docs/deployed-addresses.json (optionsDeskAddress) unless HEDERA_OPTIONS_DESK_ADDRESS is set.');
console.log('    Options desk:', h.optionsDeskAddress);
console.log('    ySOLAR token:', h.ySolarAddress || '(same deploy)');
"
echo ""

# 4) Check relayer .env has oracle address
RELAYER_ENV="$ROOT/packages/relayer-python/.env"
if [ -f "$RELAYER_ENV" ]; then
  CURRENT_ORACLE=$(grep -E "^ORACLE_CONTRACT_ADDRESS=" "$RELAYER_ENV" 2>/dev/null | cut -d= -f2- || true)
  EXPECTED_ORACLE=$(node -e "const m=require('$MANIFEST'); console.log((m.hedera||{}).oracleAddress||'')")
  if [ -n "$EXPECTED_ORACLE" ] && [ "$CURRENT_ORACLE" != "$EXPECTED_ORACLE" ]; then
    echo "4. Relayer .env has ORACLE_CONTRACT_ADDRESS=$CURRENT_ORACLE but manifest has $EXPECTED_ORACLE."
    echo "   Update packages/relayer-python/.env: ORACLE_CONTRACT_ADDRESS=$EXPECTED_ORACLE"
    echo ""
  else
    echo "4. Relayer ORACLE_CONTRACT_ADDRESS matches manifest (or not set in .env)."
    echo ""
  fi
fi

echo "5. One-time: mint, approve, and fund desk (so trading-api can submit options):"
echo "   cd packages/contracts-hedera && npx hardhat run scripts/manual-write-option.js --network hederaTestnet"
echo ""
echo "Done. Start relayer (Postgres → Oracle), trading-api, and ai-copilot to run the full flow."
