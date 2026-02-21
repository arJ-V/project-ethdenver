# RWA + Options + AI Copilot — Full Stack

Institutional-style pipeline: **mint RWAs from real-world assets** (e.g. yield in kWh), tokenise them on **ADI** and **Hedera**, trade **covered-call options** with scheduled settlement (HSS), and use an **AI copilot** (Ask / Trade) with live data—all on a single order pipeline.

## What’s in the repo


| Area            | Contents                                                                                          |
| --------------- | ------------------------------------------------------------------------------------------------- |
| **Frontend**    | Issuer Portal + Trader Terminal (Next.js/Vite in `packages/frontend`)                             |
| **AI Copilot**  | Two-mode agent (Ask: markets/yield; Trade: NL → order) on 0G (`packages/ai-copilot`)              |
| **Trading API** | Write-option endpoint; shared by UI and copilot (`packages/trading-api`)                          |
| **SolarTick**   | RWA API + bootstrap (mint RWA on ADI), telemetry ingest (`solartick/`)                            |
| **Relayer**     | ADI → mint ySOLAR on Hedera; oracle push (`packages/relayer-python`)                              |
| **Contracts**   | ADI vault (`packages/contracts-adi`); Hedera token, oracle, options (`packages/contracts-hedera`) |


## Running the project

**The full application cannot be run without QuickNode.** Live telemetry is delivered via QuickNode (stream → webhook → SolarTick backend). Until you configure a QuickNode stream and point its webhook at your backend, you will not get live charts, oracle updates from telemetry, or full adjudication flows. You can still run contract tests, deploy, bootstrap RWAs, and run the HSS options script with manual oracle pushes—but the end-to-end product experience (Trader Terminal with live data, copilot with real numbers) depends on QuickNode. See **Telemetry / QuickNode** below and the docs for setup.

### One-time setup

1. **Install**
  ```bash
   npm install
   cd packages/relayer-python && python -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt && cd ../..
  ```
2. **Configure env**
  Copy `.env.example` / `packages/relayer-python/.env.example` and `solartick/.env.example` as needed. Set ADI and Hedera RPC URLs, operator keys, and (for full run) QuickNode webhook and DB URLs.
3. **Deploy contracts** (testnets)
  ```bash
   npm run preflight   # balance check
   npm run deploy:adi
   npm run deploy:hedera
  ```
   Addresses go to `docs/deployed-addresses.json`.

### Run tests (no QuickNode required)

```bash
npm run test
```

## Telemetry / QuickNode

- **Requirement**: The app is built to consume **live telemetry** (e.g. solar/energy) via **QuickNode**. You must create a stream, configure the webhook to your SolarTick backend ingest URL, and set the webhook secret in `solartick/.env`. Without this, the Trader Terminal won’t show live charts from real data, and the full adjudication/oracle path won’t be driven by telemetry.
- **Docs**: Telemetry and ingest are described in `solartick/` README and in the main docs (e.g. `docs/demo-runbook.md`). Use those to wire QuickNode before running the full stack.

## Repository layout

- `**packages/contracts-adi`** — ADI vault (mint/lock RWA)
- `**packages/contracts-hedera**` — ySOLAR, YieldOracle, HederaOptionsDesk (options + HSS)
- `**packages/relayer-python**` — ADI event → mint ySOLAR; oracle queue → Hedera
- `**packages/trading-api**` — Write-option API (UI + copilot)
- `**packages/ai-copilot**` — Ask / Trade copilot (0G)
- `**packages/frontend**` — Issuer Portal + Trader Terminal
- `**solartick/**` — Backend (RWA API, bootstrap, telemetry ingest), DB, publisher

## Docs

- `**docs/architecture.md**` — Full app architecture (frontend, copilot, APIs, chains, QuickNode)
- `**docs/event-schema.md**` — On-chain event schemas and timeline mapping

