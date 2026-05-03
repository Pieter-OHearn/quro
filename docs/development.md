# Development

This guide is for contributors working directly with Bun and Python.

If you just want the fastest local setup for testing, use the Docker path:

```bash
bun run dev:docker
```

Then open `http://localhost:3000`. The bunq callback for the Docker setup is `http://localhost:3000/api/bunq/oauth/callback`.

## Prerequisites

- Bun 1.x
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

1. Make sure the root `.env` exists and points the bunq redirect at the Docker origin:

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

## Testing and Quality Checks

```bash
bun run ci:check
bun run typecheck
bun run test
bun run test:ui
```

Install the checked-in Git hook with `gitleaks` on your `PATH`:

```bash
brew install gitleaks
bun run hooks:install
```

The pre-commit hook runs `gitleaks git --pre-commit --redact --staged --verbose` before `bun run ci:check`.
