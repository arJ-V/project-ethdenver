# Hedera E2E: Pitfalls and Fixes

Notes from getting the full flow working (agent → real pricing → writeOption on Hedera testnet). **Do not commit `.env` files or private keys.**

---

## 1. Writer / desk / key alignment (ERC20InsufficientAllowance)

**Symptom:** `writeOption` reverts with selector `0xfb8f41b2` (ERC20InsufficientAllowance): allowance 0, needed 100.

**Cause:** The **writer** address that the trading-api uses to sign the tx is not the same one that ran `manual-write-option.js`. So the desk was approved for wallet A, but the API was sending txs from wallet B.

**Fixes:**

- **Same writer key everywhere:** The trading-api must use the **same** private key as the one used when you run `manual-write-option.js`. Hardhat (contracts-hedera) loads env in order: **repo root `.env`** then **`packages/relayer-python/.env`**. So the “approved” writer is whoever that key resolves to (e.g. `0x5285...`).
- **Trading-api env load order:** In `server.js` we load root `.env`, then relayer `.env`, then trading-api `.env`. That way `HEDERA_OPERATOR_KEY` (or `WRITER_PRIVATE_KEY`) is the same as in Hardhat. **Do not** set `WRITER_PRIVATE_KEY` in trading-api `.env` if you want to use the relayer/root key; leave it unset so the server falls back to `HEDERA_OPERATOR_KEY` from root/relayer.
- **Same desk:** Do **not** set `HEDERA_OPTIONS_DESK_ADDRESS` in trading-api `.env` unless you intend to use a different deployment. If unset, the API uses `docs/deployed-addresses.json` → `hedera.optionsDeskAddress`. The desk you approved in `manual-write-option.js` is that manifest desk; if the API overrides with a different desk, that desk has no allowance for your writer.
- **Check alignment:** Run `cd packages/trading-api && node print-writer-desk.js` to see which writer address and desk the API will use. Then run `manual-write-option.js` (with no desk/YSOLAR overrides) so that same writer approves that same desk.

---

## 2. Strike must match oracle (Postgres → relayer → contract)

**Symptom:** Option writes but settlement or pricing feels wrong.

**Cause:** The contract compares `yieldIndex >= strike` at settlement. The relayer pushes `price_cents` from Postgres into the YieldOracle. So strike and oracle must be in the **same units** (cents).

**Fix:** The ai-copilot does **not** send the user’s chat “strike” to the contract. In `hedera/client.py`, at submit time we call SolarTick `GET /api/price?site_id=...` and use that `asset_price_cents` as the strike. Set `SOLARTICK_API_BASE_URL` (and optionally `SOLARTICK_SITE_ID`) in ai-copilot `.env` so the copilot can reach the backend. If the backend is unreachable, we fall back to the intent strike and log a warning.

---

## 3. Revert decoding (unknown custom error → clear message)

**Symptom:** API returns 502 with a generic message; hard to see why the contract reverted.

**Fixes:**

- **Trading-api:** We map known revert selectors to names (e.g. `0xfb8f41b2` → ERC20InsufficientAllowance, desk errors, OracleStale). When we don’t recognize the selector we still return it in the response and log it so you can add a mapping or fix the cause.
- **Ai-copilot:** On non-2xx we read the API error body and surface `code` and `message` (and selector in details) so the e2e output shows e.g. `CONTRACT_ERC20INSUFFICIENTALLOWANCE` instead of “502 Bad Gateway”.

---

## 4. Relayer oracle address vs manifest

**Symptom:** Oracle not initialized or wrong price on-chain.

**Cause:** Relayer’s `ORACLE_CONTRACT_ADDRESS` in `.env` pointed at an old or different YieldOracle than the one in `docs/deployed-addresses.json`.

**Fix:** After deploying (e.g. `npm run hedera:ensure`), set `ORACLE_CONTRACT_ADDRESS` in `packages/relayer-python/.env` to `hedera.oracleAddress` from the manifest. The ensure script prints the value.

---

## 5. Python 3.9 and type hints

**Symptom:** `TypeError: unsupported operand type(s) for |: 'type' and 'NoneType'` in ai-copilot.

**Cause:** `int | None` is valid only in Python 3.10+.

**Fix:** Use `Optional[int]` from `typing` in `hedera/client.py` (and anywhere else that must run on 3.9).

---

## 6. E2E and service ports

- E2e script expects **trading-api** on **3001**, **ai-copilot** on **8002** (override with `AI_COPILOT_PORT`), and optionally **SolarTick** on **8000** for real pricing.
- If SolarTick isn’t up, the agent still runs but strike falls back to the intent value and we log a warning.

---

## Quick checklist before running e2e

1. **Hedera:** `docs/deployed-addresses.json` exists (or run `npm run hedera:ensure`). Relayer `ORACLE_CONTRACT_ADDRESS` matches manifest.
2. **Writer/desk:** Run `node packages/trading-api/print-writer-desk.js`. Then run `manual-write-option.js` with no overrides so that writer approves that desk. Restart trading-api after any `.env` change.
3. **Env:** No secrets in repo. Use `.env` (gitignored) in each package; see `.env.example` where available.
4. **Services:** SolarTick (8000), relayer (process), trading-api (3001), ai-copilot (8002). Then `./scripts/e2e-run-agent-test.sh`.
