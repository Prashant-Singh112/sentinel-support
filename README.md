Sentinel Support Console
========================

Run It (Node 20.19+)
--------------------

1. Install dependencies with your NVM-managed Node:
   ```
   nvm use 20.19.5
   npm install
   ```
2. Start local Postgres + Redis (Docker Desktop, brew, or native services).
3. Initialize data (safe to re-run):
   ```
   npm run migrate -w api
   npm run seed -w api
   ```
4. Launch services in separate terminals:
   ```
   npm run dev -w api   # Express on http://localhost:4000
   npm run dev -w web   # Vite on http://localhost:5173
   ```

Docker (offline bundle)
-----------------------

1. Start Docker Desktop (ensure the engine is running).
2. From repo root:
   ```
   docker compose up --build
   ```
   - `postgres` + `redis` are wired with default credentials.
   - `api` waits for DB, runs migrations + seeding automatically, then serves on `http://localhost:4000`.
   - `web` builds the React app and serves on `http://localhost:5173`, pointing at the API container.

Architecture
------------

```
┌────────────┐     REST/SSE     ┌────────────┐     SQL / telemetry
│ React/Vite │◀────────────────▶│  Express   │◀──────────────┐
│ Tailwind   │                  │ TypeORM    │               │
└────┬───────┘                  └────┬───────┘               │
     │  React Query / SSE            │                       │
     │                               │                       │
     ▼                         ┌─────▼─────┐    pub/sub      ▼
┌────────────┐  background  ┌──┤ PostgreSQL├──────────────┐ Redis
│  Triage UI │◀─case events─┤  └───────────┘              └─────
└────────────┘              │
                            │ metrics/logs → Prometheus/Pino
```

Field Notes
-----------

* **Streams first:** triage drawer subscribes to `/api/triage/:runId/stream` via SSE and renders tool updates plus fallback events with keyboard-friendly focus trapping.
* **Deterministic seeding:** `npm run migrate -w api` initializes the schema, `npm run seed -w api` streams the 200k+ transaction fixture via `stream-json`, so load-testing ≥1M rows happens locally.
* **Eval CLI:** `npm run eval -w api` replays the `/fixtures/evals/*.json` golden set, executes the real actions (OTP, dispute, contact), and prints success rate, fallback totals, latency p50/p95, and a risk confusion matrix.
* **Security posture:** API key + rate limit middleware support both headers and query params so SSE and Postman can authenticate; prompt-injection and PII redaction are enforced server-side before traces/audit logs persist.
* **Observability:** Prometheus histograms (`api_request_latency_ms`, `agent_latency_ms`), counters (`tool_call_total`, `agent_fallback_total`, `action_blocked_total`, `rate_limit_block_total`), and JSON logs (Pino) provide the audit surface; metrics are exposed on `/metrics`.

Supporting Docs
---------------

* `docs/ADR.md` – key decisions (SSE vs WebSocket, TypeORM over Prisma, streaming CSV ingest, etc.).
* `docs/Sentinel.postman_collection.json` – Postman collection with pre-wired routes and environment variables.
* `scripts/generate-fixtures.js` – expand fixtures to ≥1M transactions if needed.

