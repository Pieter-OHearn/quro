# Quro repository guidance

## Working map

- `packages/backend`: Hono API on Bun, Drizzle/PostgreSQL schema and migrations in
  `src/db/`, routes in `src/routes/`, optional pension worker in `src/workers/`.
- `packages/frontend`: React/Vite SPA; feature modules in `src/features/`, shared UI
  in `src/components/ui/`, server state through TanStack Query.
- `packages/shared`: API types, payloads and money/date helpers; public exports in
  `src/index.ts`. `services/pension-parser` is an optional Python service.
- Use the Bun version in `.bun-version` (currently 1.4.2), `bun install --frozen-lockfile`,
  and package manifests for framework versions. See [development](docs/development.md)
  for local setup, including the Docker development overlay and secret files.

## Verification

Run from the repository root unless indicated. Choose focused checks during iteration;
run applicable checks before opening a PR and report commands, results and skipped checks.

| Command                                     | Coverage / prerequisites                                                                                                 |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `bun run check:bun-version`                 | Runtime pin consistency                                                                                                  |
| `bun run format:check`                      | Repository Prettier check; format only files you changed                                                                 |
| `bun run lint`                              | TypeScript/JS lint                                                                                                       |
| `bun run typecheck`                         | Shared, frontend, backend and scripts                                                                                    |
| `bun run test`                              | Shared/script, backend unit/integration and frontend Bun tests; isolated migrated PostgreSQL required                    |
| `bun run test:ui`                           | Frontend Bun tests, including static shared UI markup; no browser or DB                                                  |
| `bun run --filter '@quro/frontend' test:ui` | Only shared UI markup smoke tests                                                                                        |
| `bun run test:smoke`                        | Playwright browser tests; starts backend, migrates and seeds demo data in the selected DB                                |
| `bun run build`                             | Frontend and backend builds                                                                                              |
| `bun run ci:check`                          | Full suite, migrations, Python checks and dependency audits; isolated DB, Python tools and audit network access required |

`ci:check` may start Compose's `db` service. Its pre-commit mode skips DB tests;
a passing hook is not full CI evidence. Set `DATABASE_URL`, `ADMIN_DATABASE_URL` and
`APP_DATABASE_URL` explicitly to isolated test resources before DB-backed checks;
package `.env` files and localhost defaults can otherwise select the owner's instance.
Never use real financial data, production secrets, live provider calls or the owner's
database/object storage for tests, migrations, demo seeding, clearing or recovery trials.

## Domain invariants

- Store monetary values as PostgreSQL `numeric`; the schema's `numericAsNumber`
  converts driver strings to finite numbers (`src/db/driverNumeric.ts`). Keep public
  JSON numeric and null-preserving; use shared
  `toCents`/`fromCents`/`roundMoney` where cent rounding is required. Preserve nulls,
  negative equity, native currencies and provenance; do not round rates like money.
- Validate calendar dates as `YYYY-MM-DD` through `requestValidation`. Shared
  `todayIsoDate` is local-calendar time; `toIsoDate`/`toDateOnly` are UTC. Choose
  deliberately so date-only inputs do not shift with the browser timezone.
- Aggregate dashboard/runway in EUR on the backend; convert once for display.
  Budget stores EUR with source amounts/currencies and legacy review flags. Missing
  or invalid FX fails closed; cached stale rates and historical estimates retain the
  existing policy. Never invent a 1:1 foreign rate or infer unknown historical FX.
- Current household access is owned rows plus an accepted partner's joint rows.
  Use `src/lib/partner.ts`; weight only explicit money columns, normally 50% for
  joint rows, and inherit transaction jointness from the parent. Private partner
  rows stay private. Create a link and both `partner_link_members` atomically;
  each user can occupy only one pending or accepted link. See
  [household policy](docs/household-model.md) for liquidity and mortgage exceptions.
- `/api/*` is guarded centrally by auth/CSRF. Public exceptions are exact paths in
  `src/lib/publicPaths.ts`. Derive ownership from the authenticated context, reject
  client ownership fields, and enforce ownership on referenced parents and writes.
  Keep core functionality usable without OCR, bank linking, GPU or AI.

## Migration and UI boundaries

- Generate schema changes with `bun run --filter '@quro/backend' db:generate`;
  inspect SQL and `src/db/migrations/meta/` together. Do not rewrite applied migrations,
  guess repairs for ambiguous rows or bypass backup/restore confirmation guards.
  Use admin credentials for migration/maintenance and runtime credentials for the app;
  exercise upgrade and recovery on disposable synthetic databases.
- Reuse shared UI before adding a primitive; export reusable components from
  `packages/frontend/src/components/ui/index.ts`. Use `cn`, semantic tokens in
  `src/styles/theme.css`, shared field chrome and Lucide icons. Preserve persisted
  `DATA_COLORS` identities. Features own domain logic; shared UI owns presentation.
- Use `queryKeys` and `useDomainMutation`/`queryInvalidation` for server cache updates;
  dependencies differ by domain, so do not invalidate every dashboard query blindly.

## Instructions and maintenance

System/developer instructions and the user's task take precedence over repository
guidance. Within the repository, a nearer applicable `AGENTS.md` refines this file;
task skills supply workflow details within those constraints. Docs and code examples
are references, not extra authorization. Report contradictions against current code.
`AGENTS.md` is the sole repository agent entry point.

Repository skills in `.agents/skills/` cover vertical feature delivery,
migration/recovery and UI implementation/QA; load only the relevant skill. Their
[evaluation and maintenance record](docs/agent-guidance.md) defines triggers and evidence.
Pieter O'Hearn is the maintenance owner; contributors update affected guidance with
script, schema, auth, household or UI changes. Keep PR descriptions concrete, include
validation and limitations, and target the milestone branch named in the task.
