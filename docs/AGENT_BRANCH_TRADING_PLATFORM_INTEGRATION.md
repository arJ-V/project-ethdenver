# Agent Branch → Trading Platform Integration

What must change on **agent-branch** to work with the **trading platform** (HederaOptionsDesk, writeOption, HSS, events). Use this to decide structural changes and submission path.

---

## 1. Current State on Agent-Branch

| Component | Status |
|-----------|--------|
| **AI copilot** | FastAPI, Ask/Trade modes, intent extraction, `/intents` CRUD + submit |
| **Intent schema** | `TradeIntent`: writer, buyer, amount, strike, expiry (aligned with writeOption) |
| **Hedera client** | Calls external `POST {HEDERA_API_BASE_URL}/write-option` or returns mock |
| **Contracts** | Only **artifacts** (HederaOptionsDesk ABI); **no Solidity source** in repo |
| **Relayer** | **Not present** (no `packages/relayer-python`) |
| **Config** | `.env`: HEDERA_API_BASE_URL, no RPC or writer key |

The trading platform has **no HTTP API** for writeOption. Submission today is: **call `writeOption(buyer, amount, strike, expiry)` from the writer’s wallet** (e.g. Ethers/viem + Hedera testnet RPC).

---

## 2. What Must Change (Regardless of Structure)

### 2.1 Submission path

- **Current**: `hedera/client.py` → HTTP `POST /write-option` or mock.
- **Required**: Some component must call Hedera RPC with the **writer’s signer** and `desk.writeOption(buyer, amount, strike, expiry)`.

So either:

- **Option A – Direct from agent**: Agent (or a new Python module it uses) holds writer credentials, loads desk ABI + address, and sends the tx via Web3 (Hedera RPC).  
- **Option B – Small backend**: A separate service (Node or Python) holds the writer key, exposes `POST /write-option`, and the agent keeps calling an HTTP API (like now).  

See Section 4 for a recommended choice.

### 2.2 Config and addresses

- **Add**: Hedera RPC and desk address.
  - Either read `docs/deployed-addresses.json` (e.g. `hedera.optionsDeskAddress`) or env like `HEDERA_OPTIONS_DESK_ADDRESS`.
  - `HEDERA_RPC_URL` (e.g. Hedera testnet public RPC).
- **If Option A**: Writer signer — e.g. `WRITER_PRIVATE_KEY` or `HEDERA_WRITER_PRIVATE_KEY` (or later, per-session wallet).
- **If Option B**: No key in agent; backend has its own env.

### 2.3 Intent → contract mapping

- **writer**: Must be `msg.sender` for `writeOption`. So the signer used for the tx must be the intent’s `writer` (or you reject mismatches).
- **Payload**: Already correct: buyer, amount, strike, expiry. No API change needed; only the implementation of “submit” changes.

### 2.4 Post-submit: optionId and status

- **Today**: Intent store has `tx_hash`; status becomes “submitted” / “confirmed” / “failed”.
- **Contract**: `writeOption` returns `optionId` and emits `OptionWritten(optionId, ...)`.
- **Change**: Capture and store `optionId` on submit (from receipt/logs or from contract’s `nextOptionId - 1` if you prefer). Add `option_id` to intent schema and to the response of `POST /intents/{id}/submit`.
- **Optional**: Map “confirmed” to OptionWritten (e.g. by parsing logs in the same process or a small listener). MVP can stay at “submitted” + tx_hash + option_id.

### 2.5 Validation

- **Contract**: `MIN_EXPIRY = 120`, amount/strike > 0, buyer != 0, writer balance/allowance.
- **Intent**: Already validates amount/strike > 0 and expiry ≥ now + 180. You can relax to 120 to match contract or keep 180 for safety.
- **Optional**: Before submit, check writer balance/allowance via RPC (ySolar.balanceOf(writer), ySolar.allowance(writer, desk)) and return a clear error if insufficient.

---

## 3. Structural Changes (Repo / Monorepo)

### 3.1 Contracts and relayer

- **Contracts**: Agent-branch has **artifacts** but **no** `contracts/HederaOptionsDesk.sol` (and related). For the agent to **call** the desk, ABI + address is enough (you already have artifacts + `docs/deployed-addresses.json`). For **deploying** or **running scripts** (e.g. testnet deploy, prove-hss-loop), you need the Solidity and scripts from **trading-platform**.
- **Relayer**: Not on agent-branch. Needed only for the full flow (ADI lock → mint ySOLAR → oracle push). For “agent submits writeOption only,” the relayer can live on another branch or repo; the agent only needs RPC + desk address + writer key (or backend).

**Recommendation**:

- **Minimal (agent-only)**: Keep agent-branch as-is for repo structure; add a **submission module** (direct RPC or client to a small backend). Ensure `docs/deployed-addresses.json` and desk ABI (from existing artifacts) are in the agent repo.
- **Full monorepo**: Merge **trading-platform** into agent-branch (or vice versa) so one branch has: contracts source, relayer, **and** agent. Then agent uses same addresses and docs; relayer and deploy scripts are in the same tree.

### 3.2 Docs

- **Useful to have on agent-branch**: `AI_TRADING_AGENT_CONTEXT.md`, `event-schema.md`, `deployed-addresses.json`, and optionally `ORDER_SUBMISSION_GUIDE.md` (already in ai-copilot). If you merge trading-platform, these come with it; otherwise copy or symlink the ones the agent and team need.

---

## 4. Recommended Submission Path and Structure

### Option A – Direct RPC from agent (recommended for speed)

- **Where**: New module (e.g. `packages/ai-copilot/hedera/submit.py` or extend `hedera/client.py`) that:
  - Loads desk ABI (from `packages/contracts-hedera/artifacts/.../HederaOptionsDesk.json` or a checked-in minimal ABI).
  - Reads desk address from `docs/deployed-addresses.json` or env.
  - Uses `HEDERA_RPC_URL` and `HEDERA_WRITER_PRIVATE_KEY` (or equivalent).
  - Builds and signs `writeOption(buyer, amount, strike, expiry)` with the writer account, sends tx, parses receipt for `optionId`.
- **Pros**: No extra service; one codebase; fast to wire.  
- **Cons**: Writer key in agent env (mitigate with env-only, no commit; later replace with wallet connect or backend).

### Option B – Thin write-option backend

- **Where**: Small service (e.g. Node with ethers/viem, or Python with web3.py) that exposes `POST /write-option` (body: writer, buyer, amount, strike, expiry or same as intent). Service holds writer key, calls desk on Hedera, returns tx_hash and optionId.
- **Pros**: Keys stay out of the agent process; same API the agent already expects.  
- **Cons**: Extra deploy and ops; two codebases to keep in sync.

**Practical suggestion**: Start with **Option A** (direct RPC in agent) so agent-branch works end-to-end with the trading platform using only `HEDERA_RPC_URL`, `HEDERA_WRITER_PRIVATE_KEY`, and `deployed-addresses.json`. Add Option B later if you want to move keys to a dedicated signer service.

---

## 5. Checklist (Agent-Branch)

- [ ] **Submission**: Implement real `writeOption` call (Option A or B); remove or keep mock behind `HEDERA_MOCK` for dev.
- [ ] **Config**: Add `HEDERA_RPC_URL`; desk address from `deployed-addresses.json` or env; writer key (Option A) or point to backend (Option B).
- [ ] **Intent schema**: Add `option_id` (optional) and ensure submit response includes it.
- [ ] **Validation**: Keep or relax expiry to 120; optionally add balance/allowance check before submit.
- [ ] **Docs**: Ensure `AI_TRADING_AGENT_CONTEXT.md` and `deployed-addresses.json` are on branch; event-schema handy for future status/event mapping.
- [ ] **Contracts/relayer**: Decide minimal (artifacts + addresses only) vs merge trading-platform for full monorepo (source + relayer + scripts).

Once these are done, the agent branch will work with the trading platform: intents become real `writeOption` transactions on Hedera testnet, with optional `optionId` and status tracking.
