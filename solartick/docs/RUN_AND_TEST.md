# Run the DB and test

## 1. Run the stack (DB + backend + web + publisher)

From the **solartick** directory:

```bash
cd solartick
docker compose up --build
```

This starts:

| Service   | Purpose                    | URL (host)           |
|-----------|----------------------------|----------------------|
| **db**    | Postgres 15                | (internal only)      |
| **backend** | FastAPI, ingest, RWA API | http://localhost:8000 |
| **web**   | UI                         | http://localhost:5173 |
| **publisher** | Publishes to Monad (RWA or legacy) | (no port)        |

The backend runs `init_db` on startup, so tables (`telemetry_points`, `rwas`, `rwa_timeseries`, `oracle_pending_updates`, etc.) are created automatically.

---

## 2. Check DB and backend

```bash
# Health (DB connectivity)
curl -s http://localhost:8000/health

# Optional: connect to Postgres (from host; password from .env)
docker compose exec db psql -U postgres -d solartick -c "\dt"
```

---

## 3. Test RWA API (no chain)

**Create an RWA** (starting KWH → get RWA ADI ID):

```bash
curl -s -X POST http://localhost:8000/api/rwa \
  -H "Content-Type: application/json" \
  -d '{"kwh": 50000}' | jq
# → { "rwa_adi_id": 1 }
```

**Get latest RWA data:**

```bash
curl -s "http://localhost:8000/api/rwa/1/latest" | jq
# → { "ts": "...", "kwh": 50000, "price_cents": ... }
```

**Get RWA time-series** (need `from` and `to` in ISO):

```bash
curl -s "http://localhost:8000/api/rwa/1/data?from=2025-01-01T00:00:00Z&to=2026-12-31T23:59:59Z" | jq
```

**List RWAs** (used by publisher when `BACKEND_URL` is set):

```bash
curl -s http://localhost:8000/api/rwas | jq
```

---

## 4. Test legacy endpoints (optional)

```bash
# History (site_id=1, legacy telemetry)
curl -s "http://localhost:8000/api/history?site_id=1&from=2025-01-01T00:00:00Z&to=2026-12-31T23:59:59Z" | jq

# Price (site or RWA)
curl -s "http://localhost:8000/api/price?site_id=1" | jq
```

---

## 5. Demo reset (clear tables)

When `DEMO_RESET_SECRET` is set in `.env`:

```bash
curl -X POST "http://localhost:8000/api/reset?secret=my-secret-reset-key-123"
```

This truncates: `telemetry_points`, `rwa_site_state`, `rwa_timeseries`, `rwas`.

---

## 6. Run DB only (for local backend/dev)

To run **only Postgres** and point a local backend at it:

```bash
cd solartick
docker compose up db -d
```

Then in another terminal, run the backend locally (with DB on localhost):

```bash
# Backend expects DATABASE_URL. For host → container, use:
export DATABASE_URL=postgresql://postgres:postgres@localhost:5432/solartick

# Port 5432 must be published. Add to compose for db service if needed:
# ports: - "5432:5432"
```

If `db` doesn’t publish port 5432, add to `compose.yml` under `db`:

```yaml
ports:
  - "5432:5432"
```

Then:

```bash
cd solartick/backend
pip install -r requirements.txt  # or use venv
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Use `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/solartick` so the backend on the host can reach Postgres in the container.

---

## 7. Full wipe and restart

```bash
docker compose down -v
docker compose up --build
```

`-v` removes the Postgres volume so the DB starts empty; `init_db` will recreate all tables on first backend startup.
