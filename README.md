# Quro

Quro is a self-hosted personal finance app for tracking savings, investments, pensions, salary, budgets, goals, and supporting documents in one place.

## Quick Start

Quro is now Docker-first. You only need Docker Compose v2 for the default setup.

1. Copy the non-secret Docker config:

```bash
cp .env.example .env
```

2. Copy the secret templates:

```bash
for file in secrets/*.example; do cp "$file" "${file%.example}"; done
```

On macOS/Linux, lock those files down locally:

```bash
chmod 600 .env secrets/*.txt
```

3. Edit the required secret files and replace the placeholder values:

- `secrets/postgres_admin_password.txt`
- `secrets/postgres_app_password.txt`
- `secrets/minio_root_password.txt`
- `secrets/minio_app_secret_key.txt`

Optional secret files can stay blank:

- `secrets/marketstack_api_key.txt`
- `secrets/hugging_face_hub_token.txt`

4. Start the core stack:

```bash
docker compose up --build -d
```

5. Open `http://localhost` and create your first account.

If port `80` is already in use on your machine, change `QRO_FRONTEND_PORT` in `.env` and then open `http://localhost:<your-port>`.

## What Runs By Default

The default `docker compose up --build -d` path starts:

- `frontend`: nginx-served web app on `http://localhost`
- `backend`: internal API container
- `db`: internal PostgreSQL container
- `minio`: internal S3-compatible document storage
- `migrate`: one-shot admin job for DB migrations and runtime-role bootstrap
- `minio-init`: one-shot admin job that creates the app bucket and bucket-scoped MinIO user

Only the frontend is exposed to the host by default. PostgreSQL, MinIO, the backend API, and the optional AI services stay on internal Docker networks.

## Data and Backups

Runtime data is persisted in bind-mounted folders so users can see where their data lives:

- `./data/postgres`
- `./data/minio`
- `./data/vllm-cache` when the pension-import profile is enabled

Logical database backups go to:

- `./backups/db`

If you are upgrading from the older development compose setup that used Docker named volumes such as `quro_pgdata`, note that this public release now uses bind-mounted data in `./data/...`. Existing named-volume data is not auto-migrated into the new layout.

Create a backup:

```bash
docker compose run --rm db-tools backup
```

Inspect the database with `psql`:

```bash
docker compose run --rm db-tools psql
```

Restore a backup after stopping the app containers that hold DB connections:

```bash
docker compose stop backend pension-import-worker
docker compose run --rm \
  -e QRO_RESTORE_CONFIRM=restore-db \
  -e QRO_RESTORE_ALLOW_NON_EMPTY=1 \
  db-tools restore /backups/db/<dump-file>.dump
docker compose up -d backend
```

The restore flow keeps the existing safety guards: explicit confirmation is required, non-empty restores require an extra override, active DB sessions cause a hard failure, and a pre-restore backup is taken automatically when needed.

More detail is in [docs/database-safety.md](docs/database-safety.md).

## Safe Operations

Safe stop:

```bash
docker compose down
```

Destructive reset:

```bash
docker compose down -v
rm -rf data
```

`docker compose down -v` deletes Docker-managed state for the current project. Removing `./data` wipes the bind-mounted database and object storage files. Treat both as destructive operations.

## Optional Pension Import Profile

The AI-assisted pension statement import stack is optional and stays off by default.

Start it only if you have the extra dependencies, including a compatible GPU for `vllm`:

```bash
docker compose --profile pension-import up --build -d
```

That profile adds:

- `pension-import-worker`
- `pension-parser`
- `vllm`

If the model pull needs authenticated Hugging Face access, place the token in `secrets/hugging_face_hub_token.txt` before starting the profile.

## Contributor Workflow

The public path is Docker-first. If you want the Bun/Python contributor workflow instead, use:

- [docs/development.md](docs/development.md) for local development
- [docs/database-safety.md](docs/database-safety.md) for backup, restore, and destructive-operation guardrails

Install the checked-in pre-commit hook with:

```bash
brew install gitleaks
bun run hooks:install
```

The Bun `db:*` scripts still exist for contributors, but the public runtime path is the Docker `db-tools` service.

## Automated Releases & Prebuilt Images

The `main` branch is protected; all changes flow through pull requests that bump `VERSION` (at the repo root) and update `CHANGELOG.md`. Once a PR is merged, the `release` workflow automatically:

- Tags the merge commit with the SemVer stored in `VERSION`.
- Builds multi-architecture images for the backend (`ghcr.io/<owner>/quro-backend`) and frontend (`ghcr.io/<owner>/quro-frontend`) and pushes both the SemVer tag (for example `v0.0.1`) and `latest`.
- Publishes a GitHub Release whose notes are sourced from the matching CHANGELOG section.
- Generates a `docker-compose.release.yml` manifest that references the freshly published images and attaches it to the Release for one-command deployments.

Self-hosters can now deploy without cloning this repository:

```bash
curl -L https://github.com/<owner>/<repo>/releases/download/v0.0.1/docker-compose.release.yml -o docker-compose.yml
docker login ghcr.io
docker compose pull
docker compose up -d
```

Replace `<owner>/<repo>` and the version tag with the specific release you want to run. See [CONTRIBUTING.md](CONTRIBUTING.md) for detailed instructions on preparing releases.

## License

[MIT](LICENSE)
