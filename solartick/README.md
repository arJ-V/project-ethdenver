# SolarTick (Monad + QuickNode Streams)

Demo: solar-farm telemetry as on-chain events on **Monad Testnet**, ingested via **QuickNode Streams** (webhooks), stored in Postgres, with a **Live** and **Historical** UI.

## One-time setup

1. **Copy env**
   ```bash
   cp .env.example .env
   ```

2. **Deploy the contract to Monad Testnet**
   ```bash
   cd contracts
   npm install
   npx hardhat compile
   export MONAD_RPC_URL=https://testnet-rpc.monad.xyz   # or your QuickNode RPC
   export DEPLOYER_PRIVATE_KEY=0x...                      # or PUBLISHER_PRIVATE_KEY
   npx hardhat run scripts/deploy.ts --network monadTestnet
   ```
   Copy the printed contract address into `.env` as `TELEMETRY_CONTRACT_ADDRESS`.

3. **Fund the publisher wallet**  
   Use the [Monad faucet](https://faucet.monad.xyz) for the address that corresponds to `PUBLISHER_PRIVATE_KEY` in `.env`.

4. **Set QuickNode Streams webhook secret**  
   After creating the Stream (see below), set `QN_STREAMS_WEBHOOK_SECRET` in `.env` to the signing secret from the Streams destination.

## Run everything locally (containers)

From the `solartick` directory:

```bash
docker compose up --build
```

This starts:

- **db** — Postgres
- **backend** — FastAPI (ingest webhook, SSE live, history API)
- **web** — UI at http://localhost:5173
- **publisher** — Publishes telemetry to Monad Testnet every few seconds

The backend must be reachable by QuickNode for webhooks (see [Demo deployment](#demo-deployment) for a public URL).

## QuickNode Streams setup

1. In **QuickNode Dashboard** → **Streams** → **Create Stream**.
2. **Network:** Monad Testnet.
3. **Data source:** EVM logs/events; contract address = `TELEMETRY_CONTRACT_ADDRESS`; topic0 = event signature for `Telemetry(uint256,uint256,uint256,uint256)` (use the hash shown in Streams UI for that signature).
4. **Filter/Transform:** Output one JSON object per log, e.g.:
   - `site_id` (from indexed `siteId`)
   - `ts` (timestamp, unix seconds)
   - `watt_hours`
   - `battery_soc` = `batterySocBps / 10000`
   - `tx_hash`, `block_number`, `log_index`
5. **Destination:** Webhook; URL = `https://<YOUR_PUBLIC_BACKEND_URL>/ingest/quicknode/streams`; enable signing and set the shared secret in `.env` as `QN_STREAMS_WEBHOOK_SECRET`.
6. **Backfill:** In the Streams UI, use “Backfill” for the last N blocks so your DB/UI can show history.

Our backend does not index the chain directly; **QuickNode Streams is the primary ingestion pipeline**: it extracts events, transforms them, and delivers them to the app and database.

## Demo reset (streaming from empty)

- **Soft reset (DB only)**  
  When `DEMO_RESET_SECRET` is set in `.env`, you can clear the telemetry table so the Live view starts empty and new Streams events repopulate in real time:
  ```bash
  curl -X POST "http://localhost:8000/api/reset?secret=YOUR_DEMO_RESET_SECRET"
  ```
  Or: `Authorization: Bearer YOUR_DEMO_RESET_SECRET` on `POST /api/reset`.

- **Full reset (DB + volumes)**  
  To wipe Postgres and start completely fresh:
  ```bash
  docker compose down -v && docker compose up --build
  ```

- **UI “Clear data (demo)”**  
  If you build the web app with `VITE_DEMO_RESET_ENABLED=true` and `VITE_DEMO_RESET_SECRET=<secret>`, the Live page shows a “Clear data (demo)” button that calls `POST /api/reset` for a one-click reset.

## Demo deployment

For Streams webhooks to reach your backend, the backend must be **publicly reachable**. Deploy **backend + db + web** to a public VM or container host, and set the Streams webhook URL to `https://<your-backend-host>/ingest/quicknode/streams`. The publisher can run in the same deployment or locally (it only needs outbound RPC access to Monad Testnet).

## API

- `POST /ingest/quicknode/streams` — QuickNode Streams webhook (HMAC-verified).
- `GET /api/live?site_id=1` — SSE stream of new telemetry for the site.
- `GET /api/history?site_id=1&from=<ISO>&to=<ISO>&limit=10000` — Historical points (second-level granularity).
- `GET /health` — Health + DB connectivity.
- `POST /api/reset` — Truncate telemetry (demo only; requires `DEMO_RESET_SECRET`).

## License

MIT
