# Development

This guide is for contributors working directly with Bun and Python.

If you just want the fastest local setup for testing, use the Docker path:

```bash
bun run dev:docker
```

Then open `http://localhost:3000`. The bunq callback for the Docker setup is `http://localhost:3000/api/bunq/oauth/callback`.

## Prerequisites

- Bun 1.4.2 (pinned in `.bun-version`; the Dockerfiles must use the same version)
- Python 3.11+
- Docker Compose v2
- Gitleaks for the checked-in pre-commit hook

## Host Setup

1. Install workspace dependencies and the pre-commit hook (requires Gitleaks):

```bash
bun install
brew install gitleaks
bun run hooks:install
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

Run the parser locally in a third terminal:

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

Prefer the custom dump from `db:backup`: it restores in a single transaction, while a plain `.sql` restore is not atomic. A database dump does not include MinIO PDF objects, so back those up separately. After a restore, check pension import statuses and expiry dates before restarting the worker: overdue drafts may delete recovered PDFs, and restored processing jobs are not requeued automatically.

## Testing and Quality Checks

Repository agent guidance starts at [AGENTS.md](../AGENTS.md); the repository
skill and its maintenance are described in [agent guidance](agent-guidance.md).

Set `DATABASE_URL`, `ADMIN_DATABASE_URL` and `APP_DATABASE_URL` to an isolated
synthetic database before DB-backed checks. The explicit role URLs take precedence
over `DATABASE_URL` and package `.env` files may select an existing instance.
`ci:check` applies migrations (and may start Compose's DB), while Playwright's
backend setup applies migrations and seeds demo data. Never run these against the
owner's live instance.

```bash
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
