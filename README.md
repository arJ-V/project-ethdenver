# RWA + Options + AI Copilot — Full Stack

Institutional-style pipeline: **mint RWAs from real-world assets** (e.g. yield in kWh), tokenise them on **ADI** and **Hedera**, trade **covered-call options** with scheduled settlement (HSS), and use an **AI copilot** (Ask / Trade) with live data—all on a single order pipeline.

## Try the app

The app cannot be run locally without ENV configuration and QuickNode stream webhook setup. To try it out, use:

**http://16.58.44.187:3000/**

## Running locally

From the **root directory**, run:

```bash
docker compose up
```

That brings up everything needed for the full stack to work.

## What’s in the repo

| Area            | Contents                                                                                          |
| --------------- | ------------------------------------------------------------------------------------------------- |
| **Frontend**    | Issuer Portal + Trader Terminal (Next.js/Vite in `packages/frontend`)                             |
| **AI Copilot**  | Two-mode agent (Ask: markets/yield; Trade: NL → order) on 0G (`packages/ai-copilot`)              |
| **Trading API** | Write-option endpoint; shared by UI and copilot (`packages/trading-api`)                          |
| **SolarTick**   | RWA API + bootstrap (mint RWA on ADI), telemetry ingest (`solartick/`)                            |
| **Relayer**     | ADI → mint ySOLAR on Hedera; oracle push (`packages/relayer-python`)                              |
| **Contracts**   | ADI vault (`packages/contracts-adi`); Hedera token, oracle, options (`packages/contracts-hedera`) |

## Repository layout

- `packages/contracts-adi` — ADI vault (mint/lock RWA)
- `packages/contracts-hedera` — ySOLAR, YieldOracle, HederaOptionsDesk (options + HSS)
- `packages/relayer-python` — ADI event → mint ySOLAR; oracle queue → Hedera
- `packages/trading-api` — Write-option API (UI + copilot)
- `packages/ai-copilot` — Ask / Trade copilot (0G)
- `packages/frontend` — Issuer Portal + Trader Terminal
- `solartick/` — Backend (RWA API, bootstrap, telemetry ingest), DB, publisher

## Docs

- `docs/architecture.md` — Full app architecture (frontend, copilot, APIs, chains, QuickNode)
- `docs/event-schema.md` — On-chain event schemas and timeline mapping
