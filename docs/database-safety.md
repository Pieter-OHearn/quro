# Database Safety

Treat the local Quro database as production-like. The Docker stack now assumes your local Postgres and MinIO data are valuable and should not be casually reset.

## Safety Model

The default Docker runtime is built around a few explicit safety boundaries:

- Only the frontend is host-exposed by default.
- PostgreSQL and MinIO stay on internal Docker networks.
- Persistent data lives in bind mounts under `./data`, not opaque Docker volumes.
- The long-lived backend and worker use the runtime DB role, not the admin role.
- Admin-only work is isolated to one-shot containers:
  - `migrate` for migrations and runtime-role bootstrap
  - `db-tools` for backup, restore, and manual `psql`
- Destructive Bun DB scripts still require explicit confirmations and take automatic pre-destructive backups.

## Data Locations

- PostgreSQL data: `./data/postgres`
- MinIO data: `./data/minio`
- Optional vLLM cache: `./data/vllm-cache`
- Logical DB backups: `./backups/db`

`./backups` is ignored by git and is safe to copy to another machine or external backup target.

## Upgrading From The Old Named-Volume Setup

Older local setups used Docker named volumes such as `quro_pgdata` and `quro_minio-data`. The public Docker release now uses bind-mounted folders under `./data/...` instead.

Important consequence:

- starting the new public compose stack does not automatically attach your old named-volume data

Safe upgrade path:

1. Create or keep a verified logical backup from the old database.
2. Start the new bind-mounted stack.
3. Restore the logical backup into the new stack with `db-tools`.

Do not assume your old named volume has been migrated just because the new containers start successfully.

## Docker-Native Backup

Create a logical Postgres dump:

```bash
docker compose run --rm db-tools backup
```

The dump is written to:

```text
./backups/db/<database>-YYYYMMDD-HHMMSS.dump
```

The `db-tools` container runs on the internal Docker network and uses the admin DB credentials from the secret files, so the host does not need `pg_dump`, `psql`, or Bun installed.

## Docker-Native Restore

Stop any app containers that keep DB connections open:

```bash
docker compose stop backend pension-import-worker
```

Run the restore:

```bash
docker compose run --rm \
  -e QRO_RESTORE_CONFIRM=restore-db \
  -e QRO_RESTORE_ALLOW_NON_EMPTY=1 \
  db-tools restore /backups/db/<dump-file>.dump
```

Then start the backend again:

```bash
docker compose up -d backend
```

Restore guardrails:

- `QRO_RESTORE_CONFIRM=restore-db` is required.
- `QRO_RESTORE_ALLOW_NON_EMPTY=1` is required if the target DB already contains data.
- Active DB sessions cause a hard failure.
- A pre-restore backup is taken automatically when the target DB is non-empty.
- Runtime-role grants are re-applied after restore when runtime credentials are configured.

## Manual SQL Access

Open a `psql` session as the admin DB user:

```bash
docker compose run --rm db-tools psql
```

## Destructive Reset

Safe stop:

```bash
docker compose down
```

Destructive reset:

```bash
docker compose down -v
rm -rf data
```

What this does:

- `docker compose down -v` removes Docker-managed state for the current project.
- `rm -rf data` removes the bind-mounted PostgreSQL and MinIO files from disk.

Do not use that reset path unless you intentionally want to wipe the local environment.

## Runtime vs Admin DB Roles

The runtime role is created by the `migrate` service through `bun run db:bootstrap-runtime-role`.

Current MVP behavior:

- runtime containers use `POSTGRES_APP_USER`
- migrations and maintenance use `POSTGRES_ADMIN_USER`
- the runtime role does not get schema DDL or `TRUNCATE`

Current limitation:

- the runtime role still has normal table-level `DELETE` privileges for app behavior

The next heavier step, if you need stricter blast-radius reduction, is row-level security or narrower write APIs for destructive flows.

## Contributor-Only Bun Commands

The Bun DB commands still exist for contributor workflows:

```bash
bun run db:backup
bun run db:restore -- backups/db/<dump-file>.dump
bun run db:clear
```

They are no longer the primary public operating path. Prefer the Docker `db-tools` flow for day-to-day use.
