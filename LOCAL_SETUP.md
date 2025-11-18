# Local Development Setup Guide

This guide will walk you through running the Sentinel Support project locally on your machine.

## Prerequisites

- **Node.js**: Version 20.19+ (recommended: use NVM)
- **PostgreSQL**: Version 15+ (via Docker, Homebrew, or native install)
- **Redis**: Version 7+ (via Docker, Homebrew, or native install)
- **npm**: Version 10.9.0+ (comes with Node.js)

## Quick Start (Recommended: Docker)

If you have Docker Desktop installed, this is the easiest way:

```bash
# From the project root directory
docker compose up --build
```

This will:
- Start PostgreSQL on port 5432
- Start Redis on port 6379
- Build and start the API server on http://localhost:4000
- Build and start the web app on http://localhost:5173

The API will automatically run migrations and seed data on first startup.

**Access the application:**
- Frontend: http://localhost:5173
- Backend API: http://localhost:4000
- Health check: http://localhost:4000/health
- Metrics: http://localhost:4000/metrics

---

## Manual Setup (Without Docker)

### Step 1: Install Dependencies

```bash
# Navigate to project root
cd sentinel-support

# Install all workspace dependencies
npm install
```

### Step 2: Start PostgreSQL and Redis

**Option A: Using Docker (Postgres + Redis only)**
```bash
docker run -d --name sentinel-postgres \
  -e POSTGRES_USER=sentinel \
  -e POSTGRES_PASSWORD=sentinel \
  -e POSTGRES_DB=sentinel \
  -p 5432:5432 \
  postgres:15-alpine

docker run -d --name sentinel-redis \
  -p 6379:6379 \
  redis:7-alpine
```

**Option B: Using Homebrew (macOS)**
```bash
brew services start postgresql@15
brew services start redis
```

**Option C: Native Installation**
- Start PostgreSQL and Redis using your system's service manager

### Step 3: Configure Environment Variables (Optional)

The project uses sensible defaults, but you can override them by creating a `.env` file in the `api` directory:

```bash
# api/.env (optional - defaults work for local dev)
NODE_ENV=development
PORT=4000
DATABASE_URL=postgres://sentinel:sentinel@localhost:5432/sentinel
REDIS_URL=redis://localhost:6379
API_KEY_AGENT=agent-key
API_KEY_LEAD=lead-key
RATE_LIMIT_RPS=5
```

### Step 4: Initialize Database

```bash
# Run migrations to create tables
npm run migrate -w api

# Seed the database with fixtures (200k+ transactions)
npm run seed -w api
```

### Step 5: Start Development Servers

**Terminal 1 - Backend API:**
```bash
npm run dev -w api
```
The API will start on http://localhost:4000

**Terminal 2 - Frontend Web:**
```bash
npm run dev -w web
```
The web app will start on http://localhost:5173

---

## Verify Installation

1. **Check API health:**
   ```bash
   curl http://localhost:4000/health
   # Should return: {"ok":true,"service":"api","version":"development"}
   ```

2. **Check metrics:**
   ```bash
   curl http://localhost:4000/metrics
   # Should return Prometheus metrics
   ```

3. **Open the web app:**
   - Navigate to http://localhost:5173
   - You should see the Dashboard page

4. **Test API authentication:**
   ```bash
   curl -H "x-api-key: agent-key" http://localhost:4000/api/dashboard/kpis
   # Should return dashboard KPIs JSON
   ```

---

## Development Workflow

### Running Tests/Evals

```bash
# Run acceptance test suite
npm run eval -w api
```

### Generating More Test Data

```bash
# Generate 1M transactions (for performance testing)
node scripts/generate-fixtures.js --transactions=1000000

# Then re-seed the database
npm run seed -w api
```

### Database Reset

```bash
# Drop and recreate database (WARNING: deletes all data)
# Then run migrations and seed again
npm run migrate -w api
npm run seed -w api
```

---

## Troubleshooting

### Port Already in Use

If port 4000 or 5173 is already in use:

**For API (port 4000):**
```bash
PORT=4001 npm run dev -w api
```
Then update `web/.env` or `web/src/lib/api.ts` to point to the new port.

**For Web (port 5173):**
Vite will automatically try the next available port, or you can specify:
```bash
PORT=5174 npm run dev -w web
```

### Database Connection Issues

1. **Check PostgreSQL is running:**
   ```bash
   # Docker
   docker ps | grep postgres
   
   # Homebrew
   brew services list | grep postgresql
   ```

2. **Verify connection string:**
   ```bash
   psql postgres://sentinel:sentinel@localhost:5432/sentinel
   ```

3. **Check if database exists:**
   ```sql
   \l  -- List databases
   ```

### Redis Connection Issues

1. **Check Redis is running:**
   ```bash
   # Docker
   docker ps | grep redis
   
   # Test connection
   redis-cli ping
   # Should return: PONG
   ```

### API Key Authentication

The default API keys are:
- **Agent**: `agent-key`
- **Lead**: `lead-key`

You can set custom keys via environment variables:
```bash
API_KEY_AGENT=your-agent-key API_KEY_LEAD=your-lead-key npm run dev -w api
```

---

## Project Structure

```
sentinel-support/
├── api/                 # Backend Express server
│   ├── src/
│   │   ├── routes/      # API endpoints
│   │   ├── triage/      # Multi-agent orchestration
│   │   ├── entities/    # TypeORM entities
│   │   └── ...
│   └── package.json
├── web/                 # Frontend React app
│   ├── src/
│   │   ├── routes/      # React Router pages
│   │   ├── sections/    # Components (TriageDrawer, etc.)
│   │   └── ...
│   └── package.json
├── fixtures/            # Test data
│   └── evals/          # Acceptance test cases
├── scripts/            # Utility scripts
└── docker-compose.yml  # Docker orchestration
```

---

## Next Steps

1. **Explore the API:**
   - Import `docs/Sentinel.postman_collection.json` into Postman
   - Or use the web UI at http://localhost:5173

2. **Read the documentation:**
   - `README.md` - Overview and architecture
   - `docs/ADR.md` - Architecture decision records

3. **Run evals:**
   ```bash
   npm run eval -w api
   ```

4. **Check metrics:**
   - Visit http://localhost:4000/metrics for Prometheus metrics
   - Check console logs for structured JSON logs

---

## Common Commands Reference

```bash
# Install dependencies
npm install

# Start both services (requires 2 terminals)
npm run dev -w api
npm run dev -w web

# Run migrations
npm run migrate -w api

# Seed database
npm run seed -w api

# Run acceptance tests
npm run eval -w api

# Generate fixtures
node scripts/generate-fixtures.js --transactions=1000000

# Build for production
npm run build

# Lint code
npm run lint
```

---

## Need Help?

- Check the main `README.md` for architecture details
- Review `docs/ADR.md` for design decisions
- Check console logs for error messages
- Verify all services are running (PostgreSQL, Redis, API, Web)

