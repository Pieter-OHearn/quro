# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Install dependencies
bun install

# Development (frontend + backend concurrently)
bun run dev
bun run dev:frontend
bun run dev:backend

# Build
bun run build               # builds frontend only

# Linting & formatting
bun run lint
bun run lint:fix
bun run format:check
bun run format

# Database
bun run db:migrate          # run migrations
bun run db:seed             # seed demo data (demo@quro.local / password123)
bun run db:clear            # wipe all data
```

Run from within `packages/backend` for migration generation:
```bash
bun run db:generate         # generate new Drizzle migration from schema changes
```

**No automated tests exist yet.** The CI pipeline has a placeholder test job.

## Local Dev Setup

Requires Bun 1.x and Docker.

```bash
cp .env.example .env
docker compose up -d db     # start PostgreSQL only
bun run db:migrate
bun run dev
```

- Frontend: http://localhost:5173
- Backend: http://localhost:3000
- DB: localhost:5432

## Architecture

Bun workspace monorepo with three packages:

```
packages/
  shared/    # @quro/shared — TypeScript types shared by frontend and backend
  backend/   # Hono API server + Drizzle ORM
  frontend/  # React + Vite SPA
```

### Backend (`packages/backend`)

- **Framework:** Hono 4.7 on Bun runtime
- **Database:** PostgreSQL via Drizzle ORM; schema in `src/db/schema.ts`; migrations in `src/db/migrations/`
- **Auth:** Session-based with HTTP-only cookies. Sessions stored in the `sessions` table (30-day expiry). Passwords hashed with `Bun.password` (bcrypt, cost 10).
- **Route structure:** Each feature is a separate Hono app instance in `src/routes/`, mounted in `src/index.ts` under `/api/<feature>`. All routes except `/api/auth/*` and `/api/health` are protected by the `requireAuth` middleware (`src/middleware/auth.ts`).
- **Auth context:** `requireAuth` attaches `{ id, name, email }` to the Hono context; retrieved in handlers via `getAuthUser(c)` from `src/lib/authUser.ts`.
- **Error handling:** Global error handler in `src/middleware/errorHandler.ts` returns `{ error: message }` JSON.

### Frontend (`packages/frontend`)

- **Stack:** React 18, Vite 6, React Router 7, TanStack React Query, Tailwind CSS 4, Axios
- **Route guards:** `RequireAuth` redirects unauthenticated users to `/welcome`; `PublicOnly` redirects authenticated users to `/`.
- **State:** Authentication state lives in `AuthContext`; currency preferences in `CurrencyContext`. Server state is managed entirely via TanStack React Query.
- **Data fetching pattern:** Each feature module has a `hooks/index.ts` exporting `useQuery`/`useMutation` hooks. Mutations invalidate both the feature's query key and the dashboard query key on success.
- **API client:** Axios instance in `src/lib/api.ts` with `baseURL = VITE_API_URL` and `withCredentials: true`.

### Shared (`packages/shared`)

Contains TypeScript types used by both frontend and backend. Imported as `@quro/shared` via path aliases configured in each package's `tsconfig.json`.

## Code Conventions

- **ESLint rules to be aware of:** max 50 lines per function, max complexity 10, no floating promises, `readonly` preferred for params, strict equality required. Run `bun run lint` before committing.
- **Prettier:** single quotes, 2-space indent, trailing commas everywhere, 100-char print width, LF line endings.
- **TypeScript:** strict mode enabled in all packages.
