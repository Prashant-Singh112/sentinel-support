Architecture Decisions
======================

1. **TypeORM + Postgres** – Prisma required Node 18+ during initial bootstrap (host was on Node 16), so TypeORM offered a decoractor-based schema that still supports migrations, streaming inserts, and fine-grained relation hints.
2. **SSE for triage drawer** – Server-Sent Events are simpler than WebSockets for one-way streaming, keep headers compatible with API-key auth, and allow the frontend to resume runs without a socket broker.
3. **Redis-backed rate limits & audit queue** – Redis provides the token-bucket limiter (5 r/s) and the background case-event append queue with retries/circuit breakers without coupling to Postgres transactions.
4. **Streaming ingest** – `stream-json` ingests the ≥200k transaction fixture (and scales past 1M rows) without loading the entire file into memory, while TypeORM’s `insert ... or ignore` keeps (customerId, txnId) dedupe cheap.
5. **React Query + React Router** – Query caching makes SSE + REST interop straightforward across routes (`/dashboard`, `/alerts`, `/customer/:id`), while router loaders keep the UI under a single layout shell.
6. **Virtualized alerts table** – `@tanstack/react-virtual` ensures the alert queue can render thousands of rows at 60fps, which is critical when simulating large-scale ingestion.
7. **Action circuits + metrics** – Each tool call goes through a wrapper that enforces the 1s timeout, retries, fallback counters, and schema validation (Zod). Prometheus histograms/counters are recorded before emitting SSE events.
8. **Eval CLI vs. component tests** – Acceptance criteria required hitting the real API surface (OTP, disputes, redaction, rate limits), so the eval runner uses SuperTest against the live Express app instead of mocked unit tests.
9. **Docker-first orchestration** – docker-compose ensures pg + redis + api + web share the same `.env` defaults, making it possible to demo the full system offline and satisfy the “run locally with fixtures” requirement.
10. **Keyboard-first drawer** – The triage drawer implements a focus trap, ESC to close, and aria labels per the spec so auditors can review the UI with screen readers and without a mouse.

