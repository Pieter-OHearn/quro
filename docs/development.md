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

2. Copy the Docker runtime config and secrets. The local Bun workflow reuses the same Postgres and MinIO credentials as the Docker stack:

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

4. Fill in `packages/backend/.env` so it matches your local Docker credentials and endpoints:

- `ADMIN_DATABASE_URL` should point at your admin Postgres user on `127.0.0.1:5432`
- `APP_DATABASE_URL` should point at your runtime Postgres user on `127.0.0.1:5432`
- `S3_ENDPOINT` should point at `http://127.0.0.1:9000` only if you temporarily expose MinIO for contributor work; the public Docker path keeps it internal
- `S3_BUCKET`, `S3_ACCESS_KEY_ID`, and `S3_SECRET_ACCESS_KEY` should match the MinIO bucket/app user created by `minio-init`

5. Start the infrastructure containers you need. The development override exposes Postgres and MinIO back to `127.0.0.1` for host-side Bun and Python processes without changing the public default compose file:

```bash
docker compose -f docker-compose.yml -f docker-compose.development.yml up -d db minio minio-init
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

Frontend Vite defaults to same-origin `/api` in Docker-like environments. For split frontend/backend development on different origins, set `VITE_API_URL=http://localhost:3000` in `packages/frontend/.env`.

## Docker Setup

This is the recommended path if you want the whole app running together with the fewest steps.

1. Make sure the root `.env` exists:

```bash
# Create it if needed.
cp .env.example .env
```

2. Start the full stack:

```bash
bun run dev:docker
```

3. Open `http://localhost:3000`.

The Docker stack publishes:

```bash
# App UI
http://localhost:3000

# Database and object storage for host-side tools
127.0.0.1:5432
127.0.0.1:9000
127.0.0.1:9001
```

For Docker, the backend stays internal to the compose network and Nginx proxies `/api` to it. That means bunq OAuth should use `http://localhost:3000/api/bunq/oauth/callback`.

## Optional Bunq Linking

Bunq linking is optional. Quro starts without it, and the bunq start and callback endpoints return `503` while the UI shows the integration as unavailable.

To enable it, set all four variables in the root `.env`:

```bash
FRONTEND_ORIGIN=http://localhost:3000
BUNQ_CLIENT_ID=<client id>
BUNQ_CLIENT_SECRET=<client secret>
BUNQ_REDIRECT_URI=http://localhost:3000/api/bunq/oauth/callback
```

Setting any of `BUNQ_CLIENT_ID`, `BUNQ_CLIENT_SECRET` or `BUNQ_REDIRECT_URI` without the rest stops the backend at startup. The error names the missing variables and never prints their values. There is no default for `FRONTEND_ORIGIN`.

Each connect attempt is recorded on the server for the initiating user and destination. It expires after 10 minutes and works once; forged, expired and replayed callbacks are redirected to the error page without touching the stored connection.

## Optional Pension Import Development

Run the worker in a second terminal:

```bash
bun run --filter '@quro/backend' worker:pension-imports
```

Run the parser locally in a third terminal, with Python 3.12 as `python3`:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r services/pension-parser/requirements.txt ruff pip-audit
uvicorn app.main:app --app-dir services/pension-parser --host 0.0.0.0 --port 8080
```

If you want the full Dockerized AI stack instead, use:

```bash
docker compose --profile pension-import up --build -d
```

## Contributor DB Commands

These are still available for local development and maintenance:

```bash
bun run db:backup
bun run db:migrate
bun run db:bootstrap-runtime-role
QRO_CLEAR_CONFIRM=clear-all-data QRO_CLEAR_ALLOW_NON_EMPTY=1 bun run db:clear
QRO_RESTORE_CONFIRM=restore-db QRO_RESTORE_ALLOW_NON_EMPTY=1 bun run db:restore -- backups/db/<dump-file>.dump
```

`db:clear` and `db:restore` keep the current confirmation guards and automatic pre-destructive backups.

For the full backup and restore procedure, what a database dump does not include (uploaded PDFs) and how to verify a restore, see [backup and restore](backup-and-restore.md).

## Testing and Quality Checks

Repository agent guidance starts at [AGENTS.md](../AGENTS.md).

```bash
bun run dev:doctor # prerequisites; no database, no .env files
bun run ci:check   # full suite, Python tooling and network audits required
bun run typecheck
bun run test       # shared/script, backend and frontend; migrated test DB required
bun run test:ui    # all frontend Bun tests; no browser or DB
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

1. Start a throwaway PostgreSQL 16 on a free port (CI uses PostgreSQL 16):

   ```bash
   docker run -d --rm --name quro-test-db -e POSTGRES_PASSWORD=tmp -e POSTGRES_USER=quro -e POSTGRES_DB=quro -p 127.0.0.1:55432:5432 --tmpfs /var/lib/postgresql/data postgres:16.11-alpine3.23
   ```

2. Export all three database URLs in the same shell. Bun loads `packages/backend/.env`
   for commands that run in that package, and the role URLs take precedence over
   `DATABASE_URL`, so exporting only `DATABASE_URL` can leave a migration pointed elsewhere:

   ```bash
   export DATABASE_URL=postgres://quro:tmp@127.0.0.1:55432/quro ADMIN_DATABASE_URL=postgres://quro:tmp@127.0.0.1:55432/quro APP_DATABASE_URL=postgres://quro:tmp@127.0.0.1:55432/quro
   ```

3. Check the setup, migrate and run the checks. The first migration can fail while
   PostgreSQL is still starting; run it again.

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

### Synthetic data

Tests and screenshots use synthetic data only. The demo seed
(`bun run --filter '@quro/backend' db:seed-demo`, also run by `test:smoke`) is
deterministic: it creates or resets the `demo@quro.local` user to a fixed profile and,
when the currency-rate table is empty, adds a fixed set of approximate EUR rates dated
on the seeding day so they count as fresh. Its values live in
`packages/backend/src/db/demoSeed.ts`.

## Packages and versions

Quro is distributed as container images, not npm packages. The root package and the
`@quro/backend`, `@quro/frontend` and `@quro/shared` workspaces are all
`"private": true`, so a package manager refuses to publish them, and none of them
needs publishing for Docker self-hosting.

`VERSION` is the only release version. The workspace manifests carry no `version`
field, so there is no second number to drift; `scripts/workspace-manifests.test.ts`
enforces both rules. Feature pull requests do not change `VERSION`; the release pull
request does (see [contributing](CONTRIBUTING.md#versioning)).
