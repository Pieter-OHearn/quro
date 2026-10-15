# Development

This guide is for contributors working directly with Bun and Python.

If you just want the fastest local setup for testing, use the Docker path:

```bash
bun run dev:docker
```

Then open `http://localhost:3000`. The bunq callback for the Docker setup is `http://localhost:3000/api/bunq/oauth/callback`.

## Prerequisites

| Tool                          | Version and source of truth                                                                                                          | Needed for                                                           |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| Bun                           | Bun 1.4.2, pinned in `.bun-version`. CI, the Dockerfiles and these docs must match; `bun run check:bun-version` enforces it.         | Everything                                                           |
| Python                        | 3.12, as in CI (`.github/workflows/ci.yml`), the parser image and `services/pension-parser/ruff.toml`. Newer 3.x versions also work. | `ci:check` (ruff, compile check, `pip-audit`) and the pension parser |
| Docker with Compose v2 plugin | `docker compose version` reports v2 or later                                                                                         | The Docker dev stack and a throwaway test database                   |
| Gitleaks                      | Any current release                                                                                                                  | The checked-in pre-commit hook                                       |

Dependencies come from `bun.lock` and `services/pension-parser/requirements.txt`, both pinned. Install JavaScript dependencies with `bun install --frozen-lockfile`, as CI and the Dockerfiles do, so a stale lockfile fails instead of changing.

## Checking your setup

```bash
bun run dev:doctor
```

`dev:doctor` checks this checkout: the Bun version against `.bun-version`, installed dependencies, Python, `ruff`, `pip-audit` (in `.venv/bin` or on `PATH`), Gitleaks, the Git hook, Docker Compose, and the exported `DATABASE_URL`, `ADMIN_DATABASE_URL` and `APP_DATABASE_URL`. It exits non-zero only when something blocks development, such as the wrong Bun version, missing dependencies or a malformed database URL. Missing optional tools are warnings.

It never connects to a database, never reads `.env` or `secrets/` files and never writes anything. For database URLs it prints only host, port and database name. It checks a development checkout, not a running Quro instance.

## Host Setup

1. Install workspace dependencies and the pre-commit hook (requires Gitleaks), then check the result:

```bash
bun install --frozen-lockfile
brew install gitleaks
bun run hooks:install
bun run dev:doctor
```

2. Copy the Docker runtime config and secrets. The local Bun workflow reuses the same Postgres credentials as the Docker stack:

```bash
cp .env.example .env
for file in secrets/*.example; do cp "$file" "${file%.example}"; done
```

On macOS/Linux, lock those files down locally:

```bash
chmod 600 .env secrets/*.txt
```

3. Copy the package-local env files:

```bash
cp packages/backend/.env.example packages/backend/.env
cp packages/frontend/.env.example packages/frontend/.env
```

In `packages/frontend/.env`, uncomment `VITE_API_URL=http://localhost:3000`. The Vite dev server has no `/api` proxy, so without it the frontend on `:5173` cannot reach the backend on `:3000`.

4. Fill in `packages/backend/.env` so it matches your local Docker credentials and endpoints:

- `ADMIN_DATABASE_URL` should point at your admin Postgres user on `127.0.0.1:5432`
- `APP_DATABASE_URL` should point at your runtime Postgres user on `127.0.0.1:5432`
- Uploaded documents go to the directory in `QRO_DOCUMENTS_DIR` (default `/var/lib/quro/documents`). On the host, create a directory you own and set `QRO_DOCUMENTS_DIR` to its absolute path; the backend never creates it, and a relative path is refused. Leave `QRO_DOCUMENT_STORAGE` at `filesystem` and the `S3_*` settings commented out unless you work on the S3 driver; then set `QRO_DOCUMENT_STORAGE=s3` and all of `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID` and `S3_SECRET_ACCESS_KEY_FILE` for an S3-compatible store you run (see [document storage](document-storage.md)). An `S3_ENDPOINT`, `S3_BUCKET` or `S3_ACCESS_KEY_ID` without `QRO_DOCUMENT_STORAGE` stops the backend at startup.

The backend validates every setting once at startup (see [Configuration](architecture.md#configuration)). Names that releases before 0.8.0 accepted (`DATABASE_HOST`, `DATABASE_PORT`, `APP_DB_USER`, `APP_DB_PASSWORD`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_ADMIN_PASSWORD`, `POSTGRES_APP_PASSWORD`, `MINIO_APP_USER` and `S3_SECRET_ACCESS_KEY`) are not read and not reported; use the settings in `.env.example`. To run the demo seed with a password of your own, set `DEMO_USER_PASSWORD`. The test scripts set `NODE_ENV=test`, which turns off rate limiting and the background jobs.

5. Start the database. The development override exposes Postgres on `127.0.0.1` for host-side Bun and Python processes without changing the public default compose file:

```bash
docker compose -f docker-compose.yml -f docker-compose.development.yml up -d db
```

6. Run migrations and bootstrap the runtime DB role:

```bash
bun run db:migrate
bun run db:bootstrap-runtime-role
```

7. Start the backend and frontend:

```bash
bun run dev
```

Open `http://localhost:5173`. Leave `VITE_API_URL` unset for the Docker stack and production builds, where Nginx serves the frontend and proxies `/api` on the same origin. Leave the `BUNQ_*` variables in `packages/backend/.env` empty unless you configure all of them; a partial bunq configuration stops the backend at startup (see [optional bunq linking](#optional-bunq-linking)).

## Docker Setup

This is the recommended path if you want the whole app running together with the fewest steps.

1. Make sure the root `.env` and the secret files exist, and keep them private:

```bash
# Create them if needed.
cp .env.example .env
for file in secrets/*.example; do cp "$file" "${file%.example}"; done
chmod 600 .env secrets/*.txt
```

Edit the copied files under `secrets/` to set your own passwords before the first start. This stack is for development; to run Quro for real, use the [install guide](install.md).

2. Start the full stack:

```bash
bun run dev:docker
```

3. Open `http://localhost:3000`. To create the first account, issue a setup code and enter it in
   the sign-up form:

```bash
docker compose exec backend quro user invite
```

The Docker stack publishes:

```bash
# App UI
http://localhost:3000

# Database for host-side tools
127.0.0.1:5432
```

Uploaded documents are stored in `./data/documents`.

The backend image runs as UID 1000. Docker Desktop on macOS does not enforce bind-mount
ownership; on Linux, give `./data/documents` and `./backups` to that UID first unless it is
already yours:

```bash
mkdir -p data/documents backups
sudo chown 1000:1000 data/documents backups
```

For Docker, the backend stays internal to the compose network and Nginx proxies `/api` to it. That means bunq OAuth should use `http://localhost:3000/api/bunq/oauth/callback`.

## Optional Bunq Linking

Bunq linking is optional. Quro starts without it. The bunq endpoints are not mounted and the bunq sync job does not run, and the UI shows the integration as unavailable.

To enable it, set all four variables in the root `.env`:

```bash
FRONTEND_ORIGIN=http://localhost:3000
BUNQ_CLIENT_ID=<client id>
BUNQ_CLIENT_SECRET=<client secret>
BUNQ_REDIRECT_URI=http://localhost:3000/api/bunq/oauth/callback
```

bunq credentials are stored encrypted, so the backend also needs a secrets key once bunq is configured (see [integration secrets](security.md#integration-secrets)). Create one and point `QRO_SECRETS_KEY_FILE` at it: for a local Bun backend, `openssl rand -hex 32 > secrets/secrets_key.txt` and `QRO_SECRETS_KEY_FILE=../../secrets/secrets_key.txt` in `packages/backend/.env`; for the repository's Compose stack, mount the same file into the `backend` and `db-tools` services as a secret named `secrets_key` (it is then read from `/run/secrets/secrets_key`). The stack does not mount it by default, because Compose refuses to start a service whose secret file is missing.

Setting any of `BUNQ_CLIENT_ID`, `BUNQ_CLIENT_SECRET` or `BUNQ_REDIRECT_URI` without the rest stops the backend at startup. The error names every missing variable and never prints their values. There is no default for `FRONTEND_ORIGIN`. The client id and secret can also come from files named by `BUNQ_CLIENT_ID_FILE` and `BUNQ_CLIENT_SECRET_FILE` (defaults `/run/secrets/bunq_client_id` and `/run/secrets/bunq_client_secret`); a variable wins over its file. `BUNQ_SANDBOX=true` talks to the bunq sandbox instead of the production API.

Each connect attempt is recorded on the server for the initiating user and destination. It expires after 10 minutes and works once; forged, expired and replayed callbacks are redirected to the error page without touching the stored connection.

## Optional Pension Import Development

Statement OCR is experimental and opt-in. The core app never needs it, and the example Compose file operators copy does not contain it.

Run the worker in a second terminal:

```bash
bun run --filter '@quro/backend' worker:pension-imports
```

Run the parser locally in a third terminal, with Python 3.12 as `python3`:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r services/pension-parser/requirements-dev.txt ruff pip-audit
uvicorn app.main:app --app-dir services/pension-parser --host 0.0.0.0 --port 8080
```

`PARSER_REGEX_ONLY=true` skips the model and uses the deterministic extractor, which needs no GPU. The parser's tests build synthetic PDFs (malformed, truncated, encrypted, huge pages, decompression bombs, slow pages) and need poppler and tesseract; the process-limit and timeout tests run on Linux only and are skipped elsewhere:

```bash
bun run check:python:test
```

If you want the full Dockerized stack instead, use the `ocr` profile:

```bash
docker compose --profile ocr up --build -d
```

The model server runs as UID 1000 and keeps its model in `./data/vllm-cache`. Give that directory to the user once, also when it holds a model downloaded by an earlier release as root: `sudo chown -R 1000:1000 data/vllm-cache`. Once the model is there, `VLLM_HF_HUB_OFFLINE=1` stops the model server from contacting Hugging Face. The parser runs as UID 10001 with a read-only root filesystem and a 256 MB `/tmp`.

### Bounds on document processing

The parser reads each document in a new child process in its own process group. The process limits its address space, CPU time and file size before it reads the PDF, and the renderer (`pdftoppm`) and OCR (`tesseract`, one thread) processes it starts inherit those limits. When the wall-clock bound runs out, or the import worker closes the connection at its own `PENSION_PARSER_TIMEOUT_MS`, the parser kills the whole group. The text layer is read page by page; OCR renders and reads one page at a time. Every bound is a whole number set on the `pension-parser` service; an invalid value stops the parser at startup.

| Setting                  | Default    | Bound                                                                             |
| ------------------------ | ---------- | --------------------------------------------------------------------------------- |
| `PARSER_MAX_FILE_MB`     | `20`       | Upload size. Larger bodies answer 413 before they are read                        |
| `PARSER_MAX_PAGES`       | `30`       | Pages in one PDF                                                                  |
| `PARSER_MAX_PAGE_PIXELS` | `40000000` | Pixels of one page rendered for OCR at 250 dpi; checked before anything is drawn  |
| `PARSER_MAX_TEXT_CHARS`  | `80000`    | Characters of text kept and sent to the model                                     |
| `PARSER_TIMEOUT_SECONDS` | `100`      | Wall-clock time for one extraction                                                |
| `PARSER_CPU_SECONDS`     | `100`      | CPU time of each process of an extraction                                         |
| `PARSER_MEMORY_MB`       | `1024`     | Address space of each process of an extraction                                    |
| `PARSER_MAX_CONCURRENCY` | `1`        | Extractions running at once                                                       |
| `PARSER_MAX_QUEUE`       | `2`        | Extractions waiting for a slot. More answer 503, and the worker retries next tick |

Compose also caps the containers: `PARSER_CPUS` (`2`), `PARSER_MEM_LIMIT` (`2g`) and 256 processes for the parser, `VLLM_CPUS` (`4`), `VLLM_MEM_LIMIT` (`24g`) and 2048 processes for the model server. `PARSER_MEMORY_MB` bounds address space, which runs ahead of the memory a process actually uses; the container limit caps what the service and its extraction processes use together. Keep `PARSER_TIMEOUT_SECONDS` plus `VLLM_TIMEOUT_SECONDS` below `PENSION_PARSER_TIMEOUT_MS` (in seconds), so the parser gives up before the worker does.

A refused document fails its import with a fixed message, such as "The PDF is password protected". Encrypted PDFs that open without a password (protected only against changes) are read; others are refused.

## Contributor DB Commands

These are still available for local development and maintenance:

```bash
bun run db:backup
bun run db:migrate
bun run db:bootstrap-runtime-role
QRO_CLEAR_CONFIRM=clear-all-data QRO_CLEAR_ALLOW_NON_EMPTY=1 bun run db:clear
QRO_RESTORE_CONFIRM=restore-db QRO_RESTORE_ALLOW_NON_EMPTY=1 bun run db:restore -- backups/db/<dump-file>.dump
```

`db:clear` and `db:restore` keep the current confirmation guards and automatic pre-destructive backups. These scripts write and read bare dumps; the operator commands `quro backup` and `quro restore` write one archive with the documents and a manifest (`bun run --filter '@quro/backend' quro backup --output <absolute dir>` from a checkout). Their tests replace `pg_dump` and `pg_restore` with stand-ins; `sh scripts/recovery-drill.sh` runs the real tools in Docker.

Accounts on a host-run backend are managed with the same operator commands as in Docker. Sign-up
needs a code from `quro user invite`; `quro user --help` lists the others (password reset codes,
session revocation). See [the security model](security.md#operator-recovery-without-email).

```bash
bun run --filter '@quro/backend' quro user invite
```

For the full backup and restore procedure, what a database dump does not include (uploaded PDFs) and how to verify a restore, see [backup and restore](backup-and-restore.md).

## Testing and Quality Checks

Repository agent guidance starts at [AGENTS.md](../AGENTS.md).

```bash
bun run dev:doctor # prerequisites; no database, no .env files
bun run ci:check   # full suite, Python tooling and network audits required
bun run typecheck
bun run docs:check # Markdown links, paths, script names and config variables; offline
bun run test       # shared/script, backend and frontend; migrated test DB required
bun run test:ui    # all frontend Bun tests; no browser or DB
bun run test:smoke # Playwright browser tests; migrates and seeds the test DB
```

The [verification table](../AGENTS.md#verification) lists every check with its
coverage and prerequisites. The pre-commit mode skips DB-backed tests, so a passing
hook alone does not prove the full suite passed. Report skipped checks with the reason.

Install the checked-in Git hook with `gitleaks` on your `PATH`:

```bash
brew install gitleaks
bun run hooks:install
```

The pre-commit hook runs `gitleaks git --pre-commit --redact --staged --verbose` before `bun run ci:check`.

### DB-backed tests

`bun run test`, `bun run ci:check` and `bun run test:smoke` need a migrated PostgreSQL.
`ci:check` applies migrations, and the Playwright backend applies migrations and seeds
demo data. The supported way is a throwaway container whose data lives in memory and
disappears when it stops. Never point these commands at the Compose `db` service, its
`data/` directory or any database that holds real data.

1. Start a throwaway PostgreSQL 18 on a free port. 18 is the only supported server, and CI runs
   the suite on it:

   ```bash
   docker run -d --rm --name quro-test-db -e POSTGRES_PASSWORD=tmp -e POSTGRES_USER=quro -e POSTGRES_DB=quro -p 127.0.0.1:55432:5432 --tmpfs /var/lib/postgresql postgres:18.6-alpine3.23
   ```

   The 18 image keeps its cluster below `/var/lib/postgresql`.

2. Export all three database URLs in the same shell. Bun loads `packages/backend/.env`
   for commands that run in that package, and the role URLs take precedence over
   `DATABASE_URL`, so exporting only `DATABASE_URL` can leave a migration pointed elsewhere:

   ```bash
   export DATABASE_URL=postgres://quro:tmp@127.0.0.1:55432/quro ADMIN_DATABASE_URL=postgres://quro:tmp@127.0.0.1:55432/quro APP_DATABASE_URL=postgres://quro:tmp@127.0.0.1:55432/quro
   ```

3. Check the setup, migrate and run the checks. `db:migrate` waits up to 30 seconds for
   PostgreSQL to accept connections.

   ```bash
   bun run dev:doctor
   bun run db:migrate
   bun run test
   ```

4. Stop the container when you are done. Its data is discarded:

   ```bash
   docker stop quro-test-db
   ```

`bun run test`, `ci:check` and `test:smoke` refuse to run without `DATABASE_URL`, never
fall back to a localhost default, never start a Compose service, and fill
`ADMIN_DATABASE_URL` and `APP_DATABASE_URL` from `DATABASE_URL` when they are not set.
The `quro migrate` and `quro doctor` tests create databases and roles with random
`quro_migrate_` and `quro_doctor_` names on that server and drop them afterwards, so the test
role needs to be a superuser, as it is in the throwaway container.

### Migration tests

A migration that changes existing rows (a new constraint, a rewrite of values, encryption)
ships an integration test that creates pre-existing synthetic rows in the shape the previous
release stored, runs the migration's SQL against them and checks the result: values, nulls and
negative amounts kept, rows that would break the constraint refused with an actionable message,
nothing guessed. `packages/backend/src/db/holdingPriceScaleMigration.test.ts` (a type change)
and `packages/backend/src/db/sessionHashMigration.test.ts` (a rewrite) are examples. A rewrite done by a command instead of SQL, such as `quro secrets encrypt`, is tested the same way: `packages/backend/src/lib/integrationSecrets.integration.test.ts` seeds bank links in the shape 0.8.0 stored them and interrupts, kills, resumes and repeats the command. A migration
that only adds a table or a nullable column needs no such test; `bun run test` applies every
migration to the throwaway database either way.

### Clean-install test

`scripts/clean-install/run.sh` installs Quro from empty directories the way
[Install Quro](install.md) describes, with `docs/compose.example.yaml` and its container
restrictions, and exercises it: sign-in, a ledger write, a document upload and download,
maintenance commands including a backup, concurrent and interrupted migrations, restarts, an
existing PostgreSQL server with an S3-compatible test store, and the image as another UID. CI runs it on amd64 and arm64. Locally it needs Docker, Bun and `curl`, and
builds the images when the tags it is given do not exist:

```bash
QURO_BACKEND_IMAGE=quro-backend:local QURO_FRONTEND_IMAGE=quro-frontend:local \
  sh scripts/clean-install/run.sh
```

It uses loopback ports 18085 and 18086 (`QURO_INSTALL_PORT`, `QURO_INSTALL_API_PORT`) and
removes every container, network and volume it created.

### README quickstart test

`scripts/quickstart/run.sh` runs the commands of the README quickstart as written, read from
`README.md` between the `<!-- quickstart:begin -->` and `<!-- quickstart:end -->` markers, so
the CI job cannot drift from the text. Before a release exists, the example Compose file comes
from the checkout and the images are the ones under test; a Compose override passed through
`COMPOSE_FILE` moves the app to a loopback port (`QURO_QUICKSTART_PORT`, default 18087) and
turns the schedulers off. It then checks the healthy state the README describes, signs in with
the printed setup code, runs the quickstart again and uninstalls with the marked commands of
[uninstall](uninstall.md). Keep the markers when you edit those pages:

```bash
QURO_BACKEND_IMAGE=quro-backend:local QURO_FRONTEND_IMAGE=quro-frontend:local \
  sh scripts/quickstart/run.sh
```

`test:smoke` starts its own backend and frontend and never reuses a server already listening on
their ports; stop it and rerun instead. The ports default to 3300 and 4273; set
`QRO_SMOKE_BACKEND_PORT` and `QRO_SMOKE_FRONTEND_PORT` to run beside another checkout or a
local Quro:

```bash
QRO_SMOKE_BACKEND_PORT=3310 QRO_SMOKE_FRONTEND_PORT=4283 bun run test:smoke
```

The smoke backend runs with `QRO_DISABLE_SCHEDULERS=true`. The interval jobs (session cleanup,
bunq sync, holding prices, currency rates, net-worth snapshots) then do not run, so the backend
makes no provider calls on its own; only endpoints a test calls directly, such as a price
refresh, could. Set the same variable for any other local backend that must not run background
jobs; leave it unset in production. It keeps documents in the filesystem store, in a
temporary directory that each run empties first and removes at the end.

### Security scans

CI scans every change as [SECURITY.md](../SECURITY.md#how-findings-are-handled) describes, through
`scripts/lib/security-scan.ts`. The scanners run from container images pinned by digest (Trivy and
gitleaks), so locally they need only Docker and Bun. Output names the rule, file and line of a
finding, never the matched text, and only files git tracks or would track are scanned:

```bash
bun scripts/lib/security-scan.ts image quro-backend:local   # vulnerabilities and secrets in an image
bun scripts/lib/security-scan.ts config                     # misconfigured Dockerfiles
bun scripts/lib/security-scan.ts secrets origin/main..HEAD  # secrets in commits; no range: all refs
bun scripts/lib/security-scan.ts exceptions --strict        # security-exceptions.yaml, expiry included
```

A critical vulnerability or misconfiguration, or any secret, makes the command exit 1. Trivy keeps
its vulnerability database in the Docker volume `quro-trivy-cache`; remove it with
`docker volume rm quro-trivy-cache`. To accept a finding, add an entry to
`security-exceptions.yaml` with a statement, an owner and an expiry at most 90 days ahead.

The licence inventory needs installed dependencies; for the parser's packages, install
`services/pension-parser/requirements.txt` into a virtual environment and pass its interpreter:

```bash
bun scripts/lib/licence-inventory.ts
python3 -m venv /tmp/quro-parser && /tmp/quro-parser/bin/pip install -r services/pension-parser/requirements.txt
bun scripts/lib/licence-inventory.ts --python /tmp/quro-parser/bin/python
```

### Synthetic data

Tests and screenshots use synthetic data only. The demo seed
(`bun run --filter '@quro/backend' db:seed-demo`, also run by `test:smoke`) is
deterministic: it creates or resets the `demo@quro.local` user to a fixed profile and,
when the currency-rate table is empty, adds a fixed set of approximate EUR rates dated
on the seeding day so they count as fresh. Its values live in
`packages/backend/src/db/demoSeed.ts`. It adds no accounts or transactions, so the demo
profile is empty.

#### Demo household

For screenshots and manual checks that need a lived-in profile, seed the household into a
migrated, throwaway database (see [DB-backed tests](#db-backed-tests)):

```bash
bun run --filter '@quro/backend' db:seed-household
```

It does everything the plain seed does, then adds `demo-partner@quro.local` as the demo user's
accepted partner and fills both accounts. Sign in as either; the password is the one of the plain
seed (`DEMO_USER_PASSWORD`, or its fixed default). The household has:

- Private and joint rows on both sides: seven savings accounts in EUR, GBP, USD and CHF with
  deposits, withdrawals and interest (the partners write to the joint ones), a joint home with a
  linked mortgage and monthly repayments, and a buy-to-let flat in pounds that is worth less than
  its debt.
- Holdings with buys, sells, dividends and a monthly price history, one of them at a loss.
- Two pension pots with contributions, fees and annual statements, two debts with payments, two
  employments with payslips (no documents), five goals, and a budget from July to the start of
  October 2026 with a payment in pounds converted at the stored rate.
- A monthly exchange-rate history (provider `seed`, the first of each month from January 2025 to
  October 2026, a few per mille around the seeded rates), so the net worth chart has stored rates
  for its whole range and no point is marked estimated.
- Every bank confirmed as a licensed entity through the app's own route, under fictional deposit
  protection schemes, so the plan page lists no bank awaiting review.
- Non-ASCII text in some names, and amounts of at most two decimals.

The seed writes through the application's own routes, in the process, with a short-lived session
of its own. Balances, joint attribution and ledger effects are therefore what the app stores for
the same input, and the seed stops with an error if a route rejects a row or the dashboard or
runway cannot be read afterwards. The synthetic tickers are excluded from price sync, so no
provider is asked about them. The seed also stops if any chart point is estimated or any bank
is unconfirmed. Everything is dated up to 2026-10-09, so the budget page shows October as a
partial month.

Running it again resets the two demo users' rows and the rate history it wrote (rates a provider stored are kept) and writes the same household again; rows have
new ids but the same content, and only the rate dates and the users' creation times follow the
clock. It refuses to run, writing nothing and exiting with an error, when the database holds any
user other than the two demo users, so it cannot add synthetic rows to a real household. A backup
or restore in progress also stops it. Each route call is its own transaction, so a seed that
fails part-way leaves a partial household; run it again to reset and complete it. It is not part of `test:smoke`, whose
backend keeps the plain seed: the smoke tests sign up users of their own, which the household
seed would then refuse, and the recovery drill starts from a demo user without rows.

The household is defined in `packages/backend/src/db/demoHousehold.ts` and written by
`packages/backend/src/db/seedHousehold.ts`.

## Packages and versions

Quro is distributed as container images, not npm packages. The root package and the
`@quro/backend`, `@quro/frontend` and `@quro/shared` workspaces are all
`"private": true`, so a package manager refuses to publish them, and none of them
needs publishing for Docker self-hosting.

`VERSION` is the only release version. The workspace manifests carry no `version`
field, so there is no second number to drift; `scripts/workspace-manifests.test.ts`
enforces both rules. Feature pull requests do not change `VERSION`; the release pull
request does (see [contributing](CONTRIBUTING.md#versioning)).

The workspaces typecheck with TypeScript 7, the native compiler. The root `package.json`
stays on TypeScript 6 because it also serves ESLint: typescript-eslint needs TypeScript's
JavaScript API, which TypeScript 7 does not ship, and stops with "typescript-eslint does not
support TS 7.0". Move the root to 7 once typescript-eslint supports it.
