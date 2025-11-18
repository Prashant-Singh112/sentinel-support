# Project Review: Sentinel Support

## ✅ What's Implemented Well

1. **Core Infrastructure**
   - ✅ Docker Compose setup with pg, redis, api, web
   - ✅ TypeORM migrations and seeding
   - ✅ Health and metrics endpoints (`/health`, `/metrics`)
   - ✅ All required API routes exist

2. **Backend APIs**
   - ✅ POST `/api/ingest/transactions` with CSV/JSON support and idempotency
   - ✅ GET `/api/customer/:id/transactions` with keyset pagination
   - ✅ GET `/api/insights/:customerId/summary`
   - ✅ POST `/api/triage` and GET `/api/triage/:runId/stream` (SSE)
   - ✅ POST `/api/action/freeze-card`, `/open-dispute`, `/contact-customer`
   - ✅ GET `/api/kb/search`
   - ✅ GET `/api/dashboard/kpis`

3. **Multi-Agent Orchestration**
   - ✅ Orchestrator with default plan: `["getProfile","recentTx","riskSignals","kbLookup","decide","proposeAction"]`
   - ✅ Tool handlers with timeouts (1s), retries (2 max), circuit breakers
   - ✅ Flow budget (5s) enforcement
   - ✅ Schema validation with Zod
   - ✅ Fallback mechanisms

4. **Security & Observability**
   - ✅ Rate limiting (5 r/s) with Redis token bucket
   - ✅ API key authentication with RBAC (agent/lead)
   - ✅ Idempotency on ingest and actions
   - ✅ PII redaction (PAN-like 13-19 digits → `****REDACTED****`)
   - ✅ Prometheus metrics (all required metrics exist)
   - ✅ Structured JSON logs (Pino)
   - ✅ Audit middleware

5. **Frontend**
   - ✅ All required routes: `/dashboard`, `/alerts`, `/customer/:id`, `/evals`
   - ✅ Virtualized alerts table (`@tanstack/react-virtual`)
   - ✅ Triage drawer with SSE streaming
   - ✅ Keyboard accessibility (focus trap, ESC to close)
   - ✅ React Query for caching

6. **Data Model**
   - ✅ All required tables with proper indexes
   - ✅ Keyset pagination support
   - ✅ Proper foreign keys and constraints

7. **Fixtures & Testing**
   - ✅ 12 eval cases (meets ≥12 requirement)
   - ✅ Fixture generator script for ≥1M transactions
   - ✅ Eval CLI with comprehensive reporting

8. **Documentation**
   - ✅ README with architecture diagram
   - ✅ ADR.md with 10 decisions
   - ✅ Postman collection

## ❌ Missing or Needs Improvement

### Critical Issues

1. **Missing "Mark False Positive" Button in TriageDrawer**
   - **Location**: `web/src/sections/TriageDrawer.tsx`
   - **Issue**: Spec requires 4 action buttons: Freeze Card, Open Dispute, Contact Customer, **Mark False Positive**
   - **Current**: Only 3 buttons are shown (grid-cols-3)
   - **Fix**: Add the 4th button and update grid to `grid-cols-4` or `grid-cols-2` with 2 rows

2. **Missing ARIA Live Region for Streaming Updates**
   - **Location**: `web/src/sections/TriageDrawer.tsx`
   - **Issue**: Spec requires "polite live region for streamed updates" for accessibility
   - **Current**: No `aria-live` region for announcing streaming events
   - **Fix**: Add `<div aria-live="polite" aria-atomic="false" className="sr-only">` to announce events

3. **Anomalies Missing Z-Score**
   - **Location**: `api/src/routes/insights.ts` (line 59-67)
   - **Issue**: Spec example shows `{"ts":"2025-07-13","z":3.1,"note":"spike"}` but implementation only has `ts`, `amountCents`, `merchant`, `note`
   - **Fix**: Calculate and include z-score in anomalies response

4. **Prompt Injection Protection Not Explicitly Implemented**
   - **Location**: Input sanitization needed in triage orchestrator
   - **Issue**: Spec requires "user text cannot trigger tools without policy check; sanitize inputs"
   - **Current**: Redaction exists but no explicit prompt injection guardrails
   - **Fix**: Add input sanitization/validation before tool execution, especially for user-provided text

### Medium Priority Issues

5. **Insights API Response Format Verification**
   - **Location**: `api/src/routes/insights.ts`
   - **Issue**: Need to verify exact format matches spec example
   - **Spec Example**: `{"topMerchants":[{"merchant":"ABC","count":12}],"categories":[{"name":"Transport","pct":0.23}],"monthlyTrend":[{"month":"2025-07","sum":120045}],"anomalies":[{"ts":"2025-07-13","z":3.1,"note":"spike"}]}`
   - **Current**: Format looks correct but `anomalies` missing `z` field (covered in #3)

6. **Performance Documentation Missing**
   - **Location**: `README.md`
   - **Issue**: Spec requires "show timing + EXPLAIN ANALYZE snippet in README" for performance requirement
   - **Current**: README mentions performance but no EXPLAIN ANALYZE output
   - **Fix**: Add section with EXPLAIN ANALYZE for `/customer/:id/transactions?last=90d` query

7. **CSP Configuration Verification**
   - **Location**: `api/src/app.ts` (line 40-48)
   - **Issue**: Spec requires "CSP suitable for sensitive data pages (no unsafe-inline)"
   - **Current**: CSP looks good but should verify no unsafe-inline is needed
   - **Note**: Current config doesn't allow unsafe-inline, which is correct

8. **Monthly Trend Format**
   - **Location**: `api/src/routes/insights.ts` (line 51-53)
   - **Issue**: Format looks correct (`{month, sum}`) but verify it matches spec exactly
   - **Spec**: `{"month":"2025-07","sum":120045}`
   - **Current**: Should match, but verify `sum` is in cents (not dollars)

### Minor Issues / Nice to Have

9. **Eval Report Output Format**
   - **Location**: `api/src/scripts/runEvals.ts`
   - **Issue**: Eval output is good but could be more structured (JSON option)
   - **Note**: Current console output is acceptable, but JSON export would be better for CI

10. **Error Handling in Frontend**
    - **Location**: Various frontend components
    - **Issue**: Some error states could be more user-friendly
    - **Note**: Current error handling is functional but could be enhanced

11. **Rate Limit Retry-After Header**
    - **Location**: `api/src/middleware/rateLimit.ts` (line 35)
    - **Issue**: Retry-After is set to "1" (hardcoded), should be dynamic based on window
    - **Current**: Works but could be more accurate

12. **Transaction Generator Script Usage**
    - **Location**: `scripts/generate-fixtures.js`
    - **Issue**: Script exists but README doesn't clearly show how to generate ≥1M transactions
    - **Fix**: Add example command: `node scripts/generate-fixtures.js --transactions=1000000`

## 📋 Action Items Summary

### Must Fix (Before Submission)
1. Add "Mark False Positive" button to TriageDrawer
2. Add ARIA live region for streaming updates
3. Add z-score to anomalies in insights API
4. Add prompt injection protection/sanitization
5. Add EXPLAIN ANALYZE snippet to README

### Should Fix (Recommended)
6. Verify insights API format matches spec exactly
7. Add example command for generating ≥1M transactions in README
8. Improve rate limit Retry-After calculation

### Nice to Have
9. Add JSON export option to eval CLI
10. Enhance error messages in frontend
11. Add more comprehensive test coverage

## ✅ Requirements Checklist

### Core Capabilities
- ✅ Frontend routes (dashboard, alerts, customer, evals)
- ✅ Triage drawer with streaming
- ✅ Virtualized tables
- ✅ Keyboard accessibility (focus trap, ESC)
- ⚠️ ARIA live region (missing)
- ✅ All backend APIs
- ✅ Multi-agent orchestration
- ✅ Rate limiting (5 r/s)
- ✅ Idempotency
- ✅ Observability (metrics, logs)
- ✅ Audit trail

### Data Model
- ✅ All required tables
- ✅ Proper indexes
- ✅ Keyset pagination

### Security
- ✅ PII redaction
- ✅ API key auth
- ✅ RBAC (agent/lead)
- ✅ CSP configuration
- ⚠️ Prompt injection protection (needs explicit implementation)

### Performance
- ✅ Keyset pagination
- ⚠️ Performance documentation (missing EXPLAIN ANALYZE)

### Acceptance Scenarios
- ✅ All 7 scenarios covered in evals
- ✅ 12 eval cases (meets ≥12 requirement)

### Deliverables
- ✅ Monorepo structure
- ✅ Docker Compose
- ✅ README
- ✅ ADR.md
- ✅ Postman collection
- ⚠️ Demo video (not in repo, but that's expected)
- ⚠️ Eval report (generated by CLI, not in repo)

## Overall Assessment

**Status**: ~90% Complete

The project is very well implemented with most requirements met. The main gaps are:
1. Missing UI button (Mark False Positive)
2. Missing accessibility feature (ARIA live region)
3. Missing data field (z-score in anomalies)
4. Missing explicit prompt injection protection
5. Missing performance documentation

These are relatively minor fixes that can be addressed quickly. The core architecture, multi-agent system, and observability are all solid.

