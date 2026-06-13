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
bun run build               # builds frontend and backend

# Linting & formatting
bun run lint
bun run lint:fix
bun run format:check
bun run format

# Database
bun run db:migrate          # run migrations
bun run db:clear            # wipe all data
```

Run from within `packages/backend` for migration generation:

```bash
bun run db:generate         # generate new Drizzle migration from schema changes
```

Unit and integration tests exist for backend routes and middleware; UI smoke tests cover shared frontend components. Run with `bun run test`. Playwright smoke tests run separately via `bun run test:ui`. Run the full CI suite locally with `bun run ci:check`.

## Local Dev Setup

Requires Bun 1.x and Docker. See [docs/development.md](docs/development.md) for the full guide.

```bash
bun install
cp .env.example .env
for file in secrets/*.example; do cp "$file" "${file%.example}"; done
cp packages/backend/.env.example packages/backend/.env
cp packages/frontend/.env.example packages/frontend/.env

# Start infrastructure (development overlay exposes Postgres + MinIO to host)
docker compose -f docker-compose.yml -f docker-compose.development.yml up -d db minio minio-init

bun run db:migrate
bun run db:bootstrap-runtime-role
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

- **Stack:** React 19, Vite 8, React Router 7, TanStack React Query, Tailwind CSS 4, Axios
- **Route guards:** `RequireAuth` redirects unauthenticated users to `/welcome`; `PublicOnly` redirects authenticated users to `/`.
- **State:** Authentication state lives in `AuthContext`; currency preferences in `CurrencyContext`. Server state is managed entirely via TanStack React Query.
- **Data fetching pattern:** Each feature module has a `hooks/index.ts` exporting `useQuery`/`useMutation` hooks. Mutations invalidate both the feature's query key and the dashboard query key on success.
- **API client:** Axios instance in `src/lib/api.ts` with `baseURL = VITE_API_URL` and `withCredentials: true`.

### Shared (`packages/shared`)

Contains TypeScript types used by both frontend and backend. Imported as `@quro/shared` via path aliases configured in each package's `tsconfig.json`.

## Pull Requests

- Do not include a link to the Claude session in PR descriptions.
- The PR description should describe the change in more detail than the title — explain what was changed and why, not just restate the title.

## Code Conventions

- **ESLint rules to be aware of:** max 80 lines per function (blank lines and comments excluded), max complexity 10, no floating promises, `readonly` preferred for params, strict equality required. Run `bun run lint` before committing.
- **Prettier:** single quotes, 2-space indent, trailing commas everywhere, 100-char print width, LF line endings. Run `bun run format` before committing to auto-fix formatting, then verify with `bun run format:check` — both must pass before pushing.
- **TypeScript:** strict mode enabled in all packages.

## Figma MCP Integration

These rules apply whenever implementing or updating UI from a Figma design.

### Required Flow (do not skip steps)

1. Call `get_design_context` on the target node(s) first to get the structured representation.
2. If the response is truncated or too large, call `get_metadata` to get the high-level node map, then re-fetch only the required nodes with `get_design_context`.
3. Call `get_screenshot` on the same node for a visual reference.
4. Only after you have both `get_design_context` output and a screenshot, download any assets and begin implementation.
5. Translate the MCP output (React + Tailwind) into this project's conventions — see rules below.
6. Validate the final UI against the Figma screenshot for 1:1 visual parity before marking complete.

### Component Organization

- IMPORTANT: Reuse existing components from `src/components/ui/` before creating anything new. Check atoms → molecules → organisms in that order.
- New atoms (single-responsibility primitives) go in `src/components/ui/atoms/`.
- New molecules (composed from atoms) go in `src/components/ui/molecules/`.
- New organisms (complex, data-connected sections) go in `src/components/ui/organisms/`.
- Export every new component from `src/components/ui/index.ts` using a named re-export.
- Feature-specific components that are not reusable belong in the feature directory, not in `src/components/ui/`.

### Styling

- Use Tailwind utility classes via the `cn()` helper (`import { cn } from '@/lib/utils'`).
- IMPORTANT: Never hardcode hex colors or raw Tailwind palette values (e.g. `bg-indigo-600`, `text-slate-500`). Always use semantic tokens from `src/styles/theme.css`.
- Semantic color tokens available as Tailwind utilities:
  - **Brand:** `bg-brand`, `bg-brand-hover`, `bg-brand-soft`, `bg-brand-soft-strong`, `text-brand-fg`, `border-brand-border`
  - **Surface:** `bg-surface`, `bg-surface-sunken`, `bg-surface-muted`, `bg-surface-inverse`
  - **Text:** `text-fg`, `text-fg-strong`, `text-fg-muted`, `text-fg-subtle`, `text-fg-faint`, `text-fg-disabled`, `text-fg-inverted`
  - **Border:** `border-border-subtle`, `border-border-default`, `border-border-strong`
  - **Status:** `bg-success-soft`, `text-success-fg`, `border-success-border` (same pattern for `warning`, `danger`, `info`)
  - **Shadow:** `shadow-card`, `shadow-popover`, `shadow-overlay`, `shadow-brand`
- Use `font-numeric` (a custom `@utility` in `theme.css`) on any financial number that needs to align across rows — balances, amounts, rates.
- Use motion tokens for transitions: `duration-fast` (120ms), `duration-base` (200ms), `duration-slow` (300ms) with `ease-standard` or `ease-emphasized`.
- Use radius tokens: `rounded-sm`, `rounded-md`, `rounded-lg`, `rounded-xl` — these are overridden in `theme.css` to a larger-than-default scale; do not set arbitrary `rounded-[value]` values.

### Component Patterns

- All components must accept a `className` prop and merge it with `cn()`.
- Define variant and size maps as `const` objects (`VARIANT_CLASSES`, `SIZE_CLASSES`) and use `keyof typeof` for prop types.
- Prefer `ComponentPropsWithoutRef<'element'>` spread for native element wrappers so all HTML attributes pass through.
- Icons come from `lucide-react` only — IMPORTANT: do not install new icon packages.
- For form field chrome (border, background, padding, focus ring), use `getFieldChrome()` from `src/components/ui/atoms/sharedFieldStyles.ts` to stay consistent with all other inputs.

### Asset Handling

- IMPORTANT: If the Figma MCP server returns a `localhost` source for an image or SVG asset, use that URL directly — do not create placeholders.
- Static image assets go in `packages/frontend/public/assets/`.
- SVG icons should be imported as Lucide components where possible; raw SVG imports go in `src/assets/`.
