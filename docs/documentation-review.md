# Documentation Review

_Reviewed against the codebase as of March 2026 (v0.0.1)._

---

## System Overview

Quro is a self-hosted personal finance application. Users track their complete financial picture in one dashboard: savings accounts, investment holdings, pension pots, mortgages, debts, salary history, budgets, and financial goals. PDF pension statements can be uploaded and parsed by an optional AI subsystem. The app is designed to run on a home server or personal device with all data stored locally.

### Main Components

| Component                 | Role                                                                                        |
| ------------------------- | ------------------------------------------------------------------------------------------- |
| **Frontend**              | React 19 SPA (Vite + React Router + TanStack Query) served by Nginx                         |
| **Backend**               | Hono 4.7 API server on Bun runtime                                                          |
| **Database**              | PostgreSQL 16 via Drizzle ORM                                                               |
| **Object storage**        | MinIO (S3-compatible) for PDF documents                                                     |
| **Pension parser**        | Python FastAPI service; extracts transactions from pension PDFs                             |
| **Pension import worker** | Long-running Bun process; polls the DB for pending import jobs and calls the parser         |
| **vLLM**                  | Optional GPU-hosted LLM (Qwen 2.5) used by the parser for higher-confidence extraction      |
| **Release webhook**       | Lightweight Node service that listens for GitHub release events and triggers a stack update |

### Frontend ↔ Backend Interaction

All API requests go to `/api/*`. In the Docker stack, Nginx proxies these to `http://backend:3000`; in local split-origin development, `VITE_API_URL` points directly at the Bun server. Authentication uses HTTP-only session cookies — the frontend never handles session tokens directly. CSRF protection is implemented via a cookie/header token pair: the backend sets a `csrf-token` cookie on sign-in and the Axios client reads it and injects it as a header on every mutating request.

### Key Technologies

- **Runtime / build:** Bun 1.x (backend, migrations, scripts), Vite 8 (frontend)
- **API framework:** Hono 4.7
- **ORM:** Drizzle ORM with schema-first migrations
- **Frontend state:** TanStack React Query (server state) + React Context (auth, currency preferences)
- **Styling:** Tailwind CSS 4
- **Charts:** Recharts
- **Testing:** `bun test` for unit/integration, Playwright for smoke tests
- **CI:** GitHub Actions (format → lint → typecheck → test → smoke test → security audit)
- **Deployment:** Multi-arch Docker images (amd64/arm64) published to GHCR on every release

---

## Documentation Quality Review

### What Is Well Documented

- **Self-hosting quickstart** (`README.md`): Clear, minimal, easy to follow. The note about the optional Marketstack API key is well placed.
- **Local dev setup** (`docs/development.md`): The six-step walkthrough covering the development compose override, credential files, optional pension-import stack, and DB helper commands is thorough.
- **Database safety** (`docs/database-safety.md`): Excellent coverage of the data model, backup/restore procedures, role separation, and the migration path from old Docker volumes.
- **Auto-update webhook** (`docs/device-auto-update-webhook.md`): Detailed and actionable; covers polling mode as a fallback.
- **Code conventions** (`CLAUDE.md`): ESLint rules, Prettier config, and TypeScript strictness requirements are clearly stated.

### Inaccuracies

These are factual errors in the current documentation relative to the actual code:

1. **`CLAUDE.md` — "No automated tests exist yet"**: Incorrect. There are unit tests, integration tests, and UI smoke tests already in the repository:
   - `packages/backend/src/middleware/cors.test.ts`
   - `packages/backend/src/routes/dashboard.test.ts`
   - `packages/backend/src/routes/debts.test.ts`
   - `packages/backend/src/routes/core.integration.test.ts`
   - `packages/backend/src/routes/finance.integration.test.ts`
   - `packages/frontend/src/lib/CurrencyContext.test.ts`
   - `packages/frontend/src/lib/api.test.ts`
   - `packages/frontend/src/components/ui/shared-ui.smoke.test.tsx`

2. **`CLAUDE.md` — "React 18"**: The frontend uses React 19.2.4.

3. **`CLAUDE.md` — "Vite 6"**: The frontend uses Vite 8.0.

### What Is Unclear or Missing

**Architecture-level gaps:**

- **No service topology diagram.** The system has five networked services (`frontend-net`, `backend-net`, `ai-net`) plus optional pension-import and auto-update profiles. A simple diagram would save significant orientation time for new contributors.
- **The pension import pipeline is not explained anywhere.** The multi-step workflow (upload → draft → processing → review → committed), the background worker, the Python parser service, the optional vLLM integration, and confidence scoring are spread across code and comments but never described as a whole.
- **The capabilities system is undocumented.** The backend exposes `/api/capabilities` and the frontend uses `useAppCapabilities` to gate features. A new developer will not know this mechanism exists.
- **The `@quro/shared` package has no documentation.** Its role (single source of truth for all cross-boundary types), how to add a new type, and why it matters for keeping frontend and backend in sync are not explained.

**Development workflow gaps:**

- **`CLAUDE.md` does not mention `docker-compose.development.yml`.** The dev override that exposes Postgres and MinIO to the host is only described in `docs/development.md`. CLAUDE.md's "Local Dev Setup" section implies a simpler workflow that will fail if followed literally.
- **Test strategy is not explained.** What each test layer covers, how to run the full CI suite locally (`bun run ci:check`), and how to write new tests for a new route are not documented anywhere.
- **Pre-commit hook setup is only in `README.md`.** Contributors following `docs/development.md` will miss the `brew install gitleaks` + `bun run hooks:install` step.

**Operational gaps:**

- **MinIO / document storage is not documented for operators.** Self-hosters know their data lives in `./data` but there is no guidance on backing up or restoring MinIO objects, or on what happens if the bucket is missing.
- **MarketStack API key scope is too brief.** The README mentions the key is needed for investments but does not explain what features degrade without it or how price sync works (lazy on-demand vs. scheduled).
- **Security architecture is scattered.** CSRF protection, session management, HTTP-only cookies, role separation, and security headers are implemented carefully but are never described together. A security-conscious self-hoster or reviewer has to piece this together from code.

**API documentation:**

- There is no machine-readable or human-readable API reference. The route structure is clear in the codebase, but the request/response shapes for each endpoint are only discoverable by reading `packages/shared/src/types/index.ts` together with each route file.

---

## Developer Onboarding Check

A new contributor with a solid TypeScript/React background could get the app running from `docs/development.md` in roughly 30–60 minutes, assuming they read it carefully alongside `CLAUDE.md`. The critical blockers they would likely hit:

1. **Missed `docker-compose.development.yml`**: CLAUDE.md's quickstart says `docker compose up -d db` but the real contributor workflow requires the development override file.
2. **Missing gitleaks**: The pre-commit hook will silently fail or block commits if gitleaks is not installed, and this step is only in README.
3. **Confusion about what tests exist**: CLAUDE.md explicitly says no tests exist, which means a new contributor may not run them or may not know to add tests for new work.

A new contributor would have no guidance on the pension import system, the capabilities pattern, or how to add a new feature module end-to-end.

---

## Prioritised Improvements

### P1 — Fix inaccuracies (high impact, low effort)

1. **Update `CLAUDE.md`**: Correct the "no automated tests" statement, update React to 19, update Vite to 8.
2. **Merge the local dev setup sections**: Align `CLAUDE.md`'s "Local Dev Setup" with `docs/development.md`'s actual six-step workflow, including the `docker-compose.development.yml` override.
3. **Add gitleaks setup to `docs/development.md`**: Move it from README into the contributor guide so it is not missed.

### P2 — Fill critical architecture gaps (high impact, moderate effort)

4. **Add `docs/architecture.md`**: Cover service topology (with a simple ASCII or Mermaid diagram), the three Docker Compose profiles (`default`, `pension-import`, `auto-update`/`maintenance`), network layout, and how frontend and backend communicate in each environment.
5. **Add pension import pipeline explanation** to `docs/architecture.md` or a dedicated `docs/pension-import.md`: Describe the draft → processing → review → committed state machine, the worker poll loop, parser confidence scoring, and the vLLM dependency.
6. **Document the `@quro/shared` package**: Add a short section to `CLAUDE.md` or `docs/architecture.md` explaining its role, how to add shared types, and why all cross-boundary types must live there.

### P3 — Improve developer experience (moderate impact, moderate effort)

7. **Document the test strategy**: Add a "Testing" section to `docs/development.md` explaining what each layer covers (unit, integration, smoke), how to run them individually and together, and the convention for adding tests to a new route.
8. **Document the capabilities system**: Add a short explanation in `CLAUDE.md` of `GET /api/capabilities`, the `useAppCapabilities` hook, and when to add a new capability flag vs. a feature always-on.
9. **Add an end-to-end "adding a new feature module" guide**: Walk through adding a backend route, shared types, a frontend hooks file, and query invalidation. This would dramatically reduce the time for a first contribution.

### P4 — Operational and security documentation (moderate impact, lower contributor priority)

10. **Add MinIO backup guidance** to `docs/database-safety.md`: Explain what is stored in MinIO (pension PDFs), how to back up the `./data/minio` directory, and how a restore interacts with DB document metadata.
11. **Add a security overview**: A short `docs/security.md` (or section in `docs/architecture.md`) describing session management, CSRF protection, the role separation model, and the Nginx security headers. Useful for self-hosters and security reviewers.
12. **Expand MarketStack documentation**: Explain which features degrade without the API key, how the lazy price-sync works, and any rate-limit considerations.
