# QuickNode Branch (SolarTick) — Guide for Agent Integration

This doc describes the **kaushik/quick-node** branch (`solartick/`) so we can use its telemetry data from the **agent-branch** (AI copilot). Easiest integration is **HTTP to the SolarTick backend API** or **direct Postgres** if both run in the same environment.

---

## 1. What This Branch Is

**SolarTick** = solar-farm telemetry on **Monad Testnet**, ingested via **QuickNode Streams** (webhooks), stored in **Postgres**, with a Live + Historical UI.

- **Contract:** `SolarTelemetry.sol` — emits `Telemetry(siteId, timestamp, wattHours, batterySocBps)` (no on-chain storage).
- **Publisher:** Node script that periodically calls `contract.publish(siteId, timestamp, wattHours, batterySocBps)` with simulated day/night production and battery SOC.
- **QuickNode Streams:** Subscribes to that contract’s events on Monad, transforms to JSON, sends to our webhook.
- **Backend:** FastAPI — receives webhook, verifies HMAC, inserts into Postgres, exposes **history** and **live SSE** APIs.
- **Web:** React app — Live view (SSE) and Historical view (time-range query).

So the **source of truth for telemetry is Postgres**; QuickNode Streams is the ingestion pipeline into that DB.

---

## 2. Repo Layout (`solartick/`)

```
solartick/
├── contracts/          # SolarTelemetry.sol, deploy to Monad Testnet
├── publisher/          # Node: publishes simulated telemetry to contract
├── backend/            # FastAPI: ingest webhook, Postgres, API
├── web/                # React: Live + Historical UI
├── compose.yml         # db, backend, web, publisher
├── .env.example
└── README.md
```

---

## 3. Data Schema

### 3.1 On-chain event (`SolarTelemetry.sol`)

```solidity
event Telemetry(
    uint256 indexed siteId,
    uint256 timestamp,
    uint256 wattHours,
    uint256 batterySocBps   // basis points, 10000 = 100%
);
```

### 3.2 QuickNode Streams → webhook payload (per event)

Transform in Streams should output one object per log, e.g.:

- `site_id` (from indexed `siteId`)
- `ts` (Unix seconds)
- `watt_hours`
- `battery_soc` = `batterySocBps / 10000` (float 0–1 or 0–100 depending on transform)
- `tx_hash`, `block_number`, `log_index`

Backend expects exactly these fields (see `ingest.py` → `StreamsEvent`).

### 3.3 Postgres table (`telemetry_points`)

| Column        | Type        | Notes                    |
|---------------|-------------|--------------------------|
| site_id       | BIGINT      | Solar site identifier    |
| ts            | TIMESTAMPTZ | When the reading was taken |
| watt_hours    | BIGINT      | Production (Wh)          |
| battery_soc   | REAL        | State of charge (e.g. 0–100 or 0–1) |
| tx_hash       | TEXT        | Monad tx hash            |
| block_number  | BIGINT      | Block number             |
| log_index     | INT         | Log index in block       |
| **PK**        | (tx_hash, log_index) | Unique per event   |

Index: `(site_id, ts DESC)` for fast time-range and “latest” queries.

### 3.4 API response shape (history / live)

Each telemetry point returned by the backend looks like:

```json
{
  "site_id": 1,
  "ts": "2025-02-20T12:00:00+00:00",
  "watt_hours": 650000,
  "battery_soc": 0.65,
  "tx_hash": "0x...",
  "block_number": 12345,
  "log_index": 0
}
```

---

## 4. Backend API (what the agent can call)

Base URL: backend at `http://localhost:8000` (or your deployed URL).

| Method | Endpoint | Purpose |
|--------|----------|--------|
| GET | `/api/history?site_id=1&from=<ISO>&to=<ISO>&limit=10000` | Historical telemetry in a time range. **Best for agent:** “last 24h”, “last 7 days”, etc. |
| GET | `/api/live?site_id=1&last=true` | SSE stream; optional “last” point on connect. Agent can use for “latest” by doing one short-lived request and taking first data event. |
| GET | `/health` | Health + DB connectivity. |

There is **no** dedicated “latest single point” REST endpoint, but you can get it by:

- **Option A:** `GET /api/history?site_id=1&from=<now-5m>&to=<now>&limit=1` and take the last row (or query with `ORDER BY ts DESC` if you add such an endpoint).
- **Option B:** One GET to `/api/live?site_id=1&last=true`, read the first SSE `data:` payload (after `connected`), then close the connection.

So for the **agent**, the most useful is **GET /api/history** with a time window (e.g. last 24 hours) to summarize yield/trends; optionally a small “latest” query or a tiny live session for “current” watt_hours / battery_soc.

---

## 5. Backend config (env)

From `solartick/backend/settings.py` and `.env.example`:

| Variable | Purpose |
|----------|--------|
| `DATABASE_URL` | Postgres connection string (default in compose: `postgresql://postgres:postgres@db:5432/solartick`) |
| `QN_STREAMS_WEBHOOK_SECRET` | HMAC secret for QuickNode Streams webhook verification |
| `CORS_ORIGINS` | Allowed origins for browser (e.g. `http://localhost:5173`) |
| `DEMO_RESET_SECRET` | Optional; enables `POST /api/reset` to truncate table |

---

## 6. How to Use This Data from the Agent (agent-branch)

Two practical options.

### Option A — HTTP to SolarTick backend (recommended)

- **Pros:** No shared DB; works across repos/deploys; same API the web app uses.
- **Cons:** SolarTick backend must be running and reachable (localhost or same network).

**On agent-branch:**

1. Add env, e.g. `SOLARTICK_API_BASE_URL=http://localhost:8000` (or your backend URL).
2. In the AI copilot (e.g. a small `telemetry` or `data` module):
   - `GET {SOLARTICK_API_BASE_URL}/api/history?site_id=1&from=<from_iso>&to=<to_iso>&limit=5000` to get a time range.
   - Optionally implement “latest” via a small window (`from=now-5m`, `to=now`, take last point) or one-shot SSE to `/api/live?site_id=1&last=true`.
3. In **ASK** mode (and optionally TRADE), inject a short summary of this data into the system prompt or a “context” message so the model can reference current yield, battery, or trends when answering or suggesting trades.

No schema changes in SolarTick; agent is just another API client.

### Option B — Direct Postgres from ai-copilot

- **Pros:** One source of truth; no extra HTTP hop; can run complex queries (e.g. aggregates) if needed.
- **Cons:** ai-copilot must have Postgres credentials and the same DB; coupling to SolarTick’s schema.

**On agent-branch:**

1. Add `asyncpg` (or `psycopg2`) and `DATABASE_URL` (or `SOLARTICK_DATABASE_URL`) pointing to the same Postgres as SolarTick (e.g. `postgresql://postgres:postgres@localhost:5432/solartick` if Postgres is port-forwarded or shared).
2. In the copilot, add a function that runs e.g.:
   - `SELECT site_id, ts, watt_hours, battery_soc FROM telemetry_points WHERE site_id = $1 AND ts >= $2 AND ts <= $3 ORDER BY ts ASC LIMIT $4`
   - Or “latest”: `SELECT ... WHERE site_id = $1 ORDER BY ts DESC LIMIT 1`.
3. Use that in ASK (and optionally TRADE) to build a short context string for the LLM.

**When to choose:** Use **Option A** if the SolarTick backend is (or will be) deployed and you want to keep services decoupled. Use **Option B** if both apps always run together (e.g. one compose or same host) and you prefer one less service dependency for the agent.

---

## 7. Quick Reference

- **Branch:** `kaushik/quick-node`
- **App dir:** `solartick/`
- **Run stack:** `cd solartick && docker compose up --build` → db, backend (8000), web (5173), publisher.
- **Telemetry table:** `telemetry_points` (site_id, ts, watt_hours, battery_soc, tx_hash, block_number, log_index).
- **Agent-facing API:** `GET /api/history?site_id=1&from=<ISO>&to=<ISO>&limit=...`; optionally `/api/live` for latest.
- **Integration:** Prefer **HTTP to backend** (Option A); use **Postgres** (Option B) only if both apps share the same DB and you want direct queries.

Once you’re back on **agent-branch**, we can add the telemetry client and wire it into the ASK (and optionally TRADE) flow using Option A or B as above.
