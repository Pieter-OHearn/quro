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
| `bun run dev:doctor`                        | Contributor prerequisites and exported DB URLs; no database connection, no `.env` reads                                  |
| `bun run check:bun-version`                 | Runtime pin consistency                                                                                                  |
| `bun run format:check`                      | Repository Prettier check; format only files you changed                                                                 |
| `bun run docs:check`                        | Markdown links and anchors, repository paths, `bun run` script names and config variables; offline                       |
| `bun run lint`                              | TypeScript/JS lint                                                                                                       |
| `bun run typecheck`                         | Shared, frontend, backend and scripts                                                                                    |
| `bun run test`                              | Shared/script, backend unit/integration and frontend Bun tests; isolated migrated PostgreSQL required                    |
| `bun run test:ui`                           | Frontend Bun tests, including static shared UI markup; no browser or DB                                                  |
| `bun run --filter '@quro/frontend' test:ui` | Only shared UI markup smoke tests                                                                                        |
| `bun run test:smoke`                        | Playwright browser tests; starts backend, migrates and seeds demo data in the selected DB                                |
| `sh scripts/clean-install/run.sh`           | Install from empty volumes with `docs/compose.example.yaml`; Docker, builds images; loopback ports 18085-18086           |
| `bun run build`                             | Frontend and backend builds                                                                                              |
| `bun run ci:check`                          | Full suite, migrations, Python checks and dependency audits; isolated DB, Python tools and audit network access required |

`ci:check`'s pre-commit mode skips DB tests; a passing hook is not full CI evidence.
Run DB-backed checks as in [DB-backed tests](docs/development.md#db-backed-tests): a
throwaway PostgreSQL with `DATABASE_URL`, `ADMIN_DATABASE_URL` and `APP_DATABASE_URL`
exported to it, since package `.env` files can otherwise select the owner's instance.
`test`, `ci:check` and `test:smoke` refuse to run without `DATABASE_URL` and never start Compose.
Never use real financial data, production secrets, live provider calls or the owner's
database/object storage for tests, migrations, demo seeding, clearing or recovery trials.

## Domain invariants

- Store monetary values as PostgreSQL `numeric`; the schema's `numericAsNumber`
  converts driver strings to finite numbers (`packages/backend/src/db/driverNumeric.ts`).
  Keep public JSON numeric and null-preserving. Money arithmetic in code uses integer cents
  through shared `toCents`/`fromCents`/`roundMoney`; parse request money with `parseMoneyField`
  (cents, below 10^13). Unit prices, quantities, rates and percentages are not money. Preserve
  nulls, negative equity, native currencies and provenance.
  Rounding points, ledger invariants and indicators: [financial invariants](docs/financial-invariants.md).
  Edits and deletes reverse a ledger row's effect from the row locked inside their transaction.
- Validate calendar dates as `YYYY-MM-DD` through
  `packages/backend/src/lib/requestValidation.ts`. Shared
  `todayIsoDate` is local-calendar time; `toIsoDate`/`toDateOnly` are UTC. Choose
  deliberately so date-only inputs do not shift with the browser timezone.
- Aggregate dashboard/runway in EUR on the backend; convert once for display.
  Budget stores EUR with source amounts/currencies and legacy review flags. Missing
  or invalid FX fails closed; stale and estimated rates follow
  `packages/backend/src/lib/currencyRateCache.ts`. Never invent a 1:1 foreign rate or infer unknown historical FX.
- Current household access is owned rows plus an accepted partner's joint rows.
  Use `packages/backend/src/lib/partner.ts`; weight only explicit money columns,
  normally 50% for joint rows, and inherit transaction jointness from the parent.
  Private partner rows stay private. See [household policy](docs/household-model.md)
  for partner links and liquidity/mortgage exceptions.
- `/api/*` is guarded centrally by auth/CSRF. Public exceptions are exact paths in
  `packages/backend/src/lib/publicPaths.ts`. Derive ownership from the authenticated context, reject
  client ownership fields, and enforce ownership on referenced parents and writes.
  Keep core functionality usable without OCR, bank linking, GPU or AI.
- Documents go through `getDocumentStore()` (`packages/backend/src/lib/documentStorage.ts`):
  the filesystem by default, S3 only with `QRO_DOCUMENT_STORAGE=s3`. Keys are relative paths that
  both drivers share; build them on the server, never from client input. See
  [document storage](docs/document-storage.md).
- Sessions and operator codes are stored only as SHA-256 digests
  (`packages/backend/src/lib/sessions.ts`, `packages/backend/src/lib/authCodes.ts`); never store or
  log a raw token. Instance operations are `quro` CLI commands (`packages/backend/src/cli/`), not
  an in-app role, and print no household data. Cookie flags come from `SECURE_COOKIES`, never from
  request headers. Deployment modes and registration: [security model](docs/security.md).

## Migration and UI boundaries

- Generate schema changes with `bun run --filter '@quro/backend' db:generate` and
  review the SQL with `packages/backend/src/db/migrations/meta/`. Migrate with admin
  credentials and run the app with runtime credentials. Do not rewrite applied migrations, guess
  repairs for ambiguous rows or bypass backup/restore confirmation guards.
- PostgreSQL 18 is the baseline; CI runs the suite on 16 and 18. The backend image ships 18 client
  tools, `packages/backend/src/db/pgTools.ts` refuses client tools older than the server, and a major
  upgrade is a dump and restore into a new data directory, never a reused one
  ([upgrade](docs/postgresql-upgrade.md)). Keep `scripts/rehearse-pg-upgrade.sh` green when changing it.
- Reuse and export shared UI from `packages/frontend/src/components/ui/index.ts`
  before adding a primitive. Preserve persisted `DATA_COLORS` identities. Features
  own domain logic; shared UI owns presentation.
- Update server caches through `useDomainMutation` and the domain map in
  `packages/frontend/src/lib/queryInvalidation.ts`; do not invalidate every query.

## Instructions

System/developer instructions and the user's task take precedence over repository
guidance. A nearer applicable `AGENTS.md` refines this file. Docs and code
examples are references, not extra authorization. Report contradictions against
current code.

For features, follow [adding a feature](docs/adding-a-feature.md); for UI, follow
[design tokens](docs/design-tokens.md) and
[shared UI verification](docs/shared-ui-verification.md). For backup and restore
work, follow [backup and restore](docs/backup-and-restore.md).

Update affected guidance in the same PR as script, schema, auth, household or UI
changes. Keep PR descriptions concrete, include validation and limitations, and
target the milestone branch named in the task.
