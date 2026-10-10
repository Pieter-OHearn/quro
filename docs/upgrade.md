# Upgrade Quro

This guide is for operators who run Quro and move it to a newer release. Quro never updates itself: you pick the version, back up, migrate and restart, by hand or from your own CI/CD. The first half covers every upgrade from 0.8.0 on. [Upgrade from 0.7.0 to 0.8.0](#upgrade-from-070-to-080) is the one-time move from the older layout, with every change that release makes.

The commands assume an install made with [the install guide](install.md): they run in the directory that holds `compose.yaml` and `config/`, and use its `migrate` service for operator commands.

## How upgrades work

- **Two images per release.** `ghcr.io/pieter-ohearn/quro-backend` (the server, the optional import worker and every `quro` command) and `ghcr.io/pieter-ohearn/quro-frontend`. Use both at the same version. Pulling them needs no registry account.
- **Pin the version and the digest.** A tag can be moved; a digest cannot. Each release's notes list the digest of both images. Pin both in `compose.yaml`, for example `image: ghcr.io/pieter-ohearn/quro-backend:v0.8.0@sha256:<digest from the release notes>`, and the same tag and digest for the `migrate` service. Docker then refuses an image whose digest does not match.
- **Migrations only move forward.** `quro migrate` applies a release's schema migrations, all in one transaction, under a lock. The server never migrates by itself. An image refuses to run against a schema it does not know: readiness stays `503` and `quro migrate` stops with exit code 3. So going back to an older image works only while it ships every migration the database has (see [Roll back or restore](#roll-back-or-restore)).
- **Readiness tells you when to route traffic.** `GET /api/health` answers `200` while the process runs. `GET /api/readiness` answers `200` only when the database answers, the schema matches the image and the document store is usable. The image's health check, `quro health`, uses readiness, so `docker compose ps` shows the backend as `healthy` only then.

## Upgrade to a new release

These steps apply from 0.8.0 on. Read the release notes and upgrade notes of every version between yours and the target first: they say what changes and whether you have to change settings.

1. Check what runs now and take a backup with the old image. A label keeps the archive out of retention:

   ```bash
   docker compose exec backend quro version
   docker compose run --rm migrate backup --label before-upgrade
   ```

   The archive lands in `./backups`. Keep it until you are satisfied with the new version. If you encrypt archives or copy them off the device with an override file, add it to this command (and to `restore` below) as in [backup and restore](backup-and-restore.md#encrypt-archives-and-copy-them-off-the-device).

2. Pin the new version: in `compose.yaml`, change the tag and digest of the `migrate`, `backend` and `frontend` images (and the import worker, if you run it). Then pull:

   ```bash
   docker compose pull
   ```

3. Check before you change anything. `--status` compares the database with the new image and changes nothing; `--dry-run` also checks the owner role, the runtime role and the PostgreSQL version:

   ```bash
   docker compose run --rm migrate migrate --status
   docker compose run --rm migrate migrate --dry-run
   ```

   Exit code 0 from `--status` means there is nothing to migrate, 1 means migrations are pending (expected for most releases), 3 means the database was migrated by a newer release than the image: stop and check which version you pinned. The [exit codes](#exit-codes) are the same everywhere.

4. Stop the server, migrate and start everything again. The `migrate` service runs first, and the backend and frontend start only when it succeeded:

   ```bash
   docker compose stop backend
   docker compose up -d --wait
   ```

   `--wait` returns when the backend reports healthy and fails when a service does not start. Stopping the backend first keeps the old server from running against the new schema.

5. Check the result:

   ```bash
   docker compose ps
   docker compose exec backend quro version
   docker compose run --rm migrate migrate --status
   docker compose run --rm migrate doctor
   ```

   The backend is `healthy`, the version is the new one, `--status` exits 0 with `Status: current.`, and `doctor` ends with `All checks passed.` Sign in and open a document.

If a step fails, see [When an upgrade fails](#when-an-upgrade-fails).

### From your own CI/CD

The same steps work unattended, because every command reports through its exit code and the checks have JSON output. A job that upgrades an install, stops on anything unexpected and leaves the old version running when a check fails:

```bash
set -eu
docker compose run --rm -T migrate backup --label before-upgrade
docker compose pull
set +e
docker compose run --rm -T migrate migrate --status --json > migrate-status.json
status=$?
set -e
# 0: nothing to migrate; 1 with a report: migrations pending. Anything else needs a person.
if [ ! -s migrate-status.json ] || [ "$status" -gt 1 ]; then
  echo "migrate --status exited $status; not upgrading" >&2
  exit 1
fi
docker compose stop backend
docker compose up -d --wait
docker compose run --rm -T migrate migrate --status
```

Change the pinned images (step 2) before this script runs, for example by templating `compose.yaml` or keeping it in your repository. `-T` keeps Compose from allocating a terminal, which jobs do not have. The [interfaces for automation](#interfaces-for-automation) describe the JSON fields and exit codes your job can rely on.

## Roll back or restore

There are two ways back after an upgrade, and they are not the same:

| Way back                       | When it is possible                                                                                   | What you lose                                                                         |
| ------------------------------ | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| **Schema-compatible rollback** | The older image ships every migration the database has: the newer release added no migration          | Nothing. The older image runs against the same database                               |
| **Restore a snapshot**         | Always, from the backup taken before the upgrade, or the data directories you copied before upgrading | Every change made since that backup: new transactions, uploads, accounts and sessions |

### Schema-compatible rollback

Pin the older image again in `compose.yaml` and ask it whether it can run against the database:

```bash
docker compose run --rm migrate migrate --status
```

- Exit code 0 (`Status: current.`): the older image ships every migration. Start it with `docker compose up -d --wait`.
- Exit code 3 (`Status: ahead.` or `Status: unknown.`): the newer release migrated the database further. The older image will not run on it: its readiness stays `503` (`schema_ahead`) and its `quro migrate` refuses with exit code 3, changing nothing. Restore a snapshot instead.

Images up to 0.7.0 have no schema check and no `--status`; going back to one of them is always a [restore](#roll-back-to-070).

### Restore the snapshot taken before the upgrade

`quro restore` restores the archive from step 1 into a new, empty database. Run it with the image the archive was written by (the older version): it refuses an archive from a newer release. Your current database stays on its volume until you remove it.

1. Stop Quro and pin the older images again in `compose.yaml`.

   ```bash
   docker compose down
   ```

2. In `compose.yaml`, give the database a new, empty volume, for example `postgres-restored:/var/lib/postgresql` in the `db` service and `postgres-restored:` under `volumes:` at the end of the file.
3. Start the empty database and restore the archive. The documents directory is not empty, so allow the restore to replace it; it writes a `-pre-restore` archive of the documents first:

   ```bash
   docker compose up -d --wait db
   docker compose run --rm -e QRO_RESTORE_CONFIRM=restore-db -e QRO_RESTORE_ALLOW_NON_EMPTY=1 \
     migrate restore /var/lib/quro/backups/<archive>.tar
   ```

4. Start Quro and check it:

   ```bash
   docker compose up -d --wait
   docker compose run --rm migrate migrate --status
   ```

[Backup and restore](backup-and-restore.md#restore) explains each guard and how to check a restore. Restoring brings back the sessions of the backup's time; run `quro user revoke-sessions` for accounts where that matters.

## When an upgrade fails

Each of these is exercised on every change by the upgrade test from a 0.7.0 install (`scripts/upgrade-fixture/upgrade.sh`) and the backend's migration tests (`packages/backend/src/cli/migrate.integration.test.ts`).

| What happened                                                                         | What you see                                                                                                                                                                                                                             | What to do                                                                                                                                                                                                                              |
| ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A migration failed**                                                                | `quro migrate` exits 1: `Migration failed: <the database's reason> (SQLSTATE …). Pending migrations run in one transaction, so none from this run was recorded`. The `migrate` service shows `exited (1)` and the backend does not start | Nothing was changed. Fix the cause the message names and run `docker compose up -d --wait` again, or [roll back](#roll-back-or-restore): the old image still matches the database                                                       |
| **The upgrade was interrupted** (host restart, `docker kill`, a CI job cancelled)     | The `migrate` container stopped without exit code 0                                                                                                                                                                                      | Nothing from the interrupted run was recorded. Run `docker compose up -d --wait` again; it applies all pending migrations                                                                                                               |
| **Two `quro migrate` ran at the same time** (two jobs, a job and `docker compose up`) | One prints `Another quro migrate is running against this database; waiting for it to finish...`                                                                                                                                          | Nothing. The second waits for the first, then prints `No migrations to apply.` Each migration is applied once                                                                                                                           |
| **The new image is unhealthy**                                                        | `docker compose ps` shows the backend `unhealthy` or `health: starting`, `docker compose up --wait` fails, the frontend does not start, and `docker compose exec backend quro health` prints the failing check                           | Read the check it names: a `schema` message that says to run `quro migrate` means it has not run (run it); `documentStorage` means the documents directory or the S3 store is not usable. Fix it, or [roll back](#roll-back-or-restore) |
| **The new image stops at startup**                                                    | The backend restarts over and over or shows `exited (2)`. `docker compose logs backend` lists every invalid setting, without values                                                                                                      | Fix the settings it names; nothing was changed. 0.8.0 stops for settings that 0.7.0 accepted: see [Strict settings](#strict-settings)                                                                                                   |
| **The schema is newer than the image**                                                | `quro migrate --status` and `quro migrate` exit 3: `The database schema is newer than this image`. Readiness reports `schema_ahead`                                                                                                      | You pinned an older image than the one that migrated the database. Pin the newer one again, or restore a snapshot                                                                                                                       |

## Interfaces for automation

These outputs are meant for scripts and monitoring. Their fields and exit codes are kept from release to release: a later release may add a field, and says so in its upgrade notes if it ever has to change or remove one. Text output without `--json` is for people and may change.

### Exit codes

Every `quro` command uses the same exit codes:

| Code | Meaning                                                                                                                       | What automation should do |
| ---- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| 0    | Done, or nothing to do                                                                                                        | Continue                  |
| 1    | The operation failed (for `--status` and `doctor`: a check failed, such as pending migrations)                                | Stop; read the output     |
| 2    | Usage or settings are invalid, including retired settings that must be replaced. Nothing was changed                          | Fix the settings          |
| 3    | A safety check refused: schema newer than the image, missing database privileges, unsupported PostgreSQL. Nothing was changed | Needs a person            |
| 4    | The database or document store cannot be reached                                                                              | Retry later               |

### `quro version --json`

Needs no settings and no database.

```json
{
  "version": "v0.8.0",
  "revision": "<commit the image was built from>",
  "migrations": { "latest": "0038_session_hashes_and_auth_codes", "count": 39 },
  "runtime": { "bun": "1.4.2", "platform": "linux", "arch": "arm64" }
}
```

`version` is the release, `revision` the commit (`unknown` outside a release build), `migrations` the newest migration the image ships and how many. Exit code 0.

### `quro migrate --status --json`

Read-only: it connects once as the owner role (`POSTGRES_ADMIN_USER`), takes no lock and changes nothing. It needs only the owner role's settings.

```json
{
  "status": "behind",
  "compatible": false,
  "message": "The database schema is 1 migration(s) behind this image. Run `quro migrate`.",
  "database": {
    "host": "db",
    "port": 5432,
    "name": "quro",
    "user": "quro_admin",
    "serverVersion": "18.6"
  },
  "applied": { "migrations": 38, "latestMigration": "0037_bunq_oauth_attempts" },
  "pending": ["0038_session_hashes_and_auth_codes"],
  "exitCode": 1
}
```

| `status`  | Meaning                                                                  | `compatible` | Exit code |
| --------- | ------------------------------------------------------------------------ | ------------ | --------- |
| `current` | Every migration the image ships is applied                               | `true`       | 0         |
| `behind`  | Migrations are pending; `quro migrate` applies `pending`                 | `false`      | 1         |
| `empty`   | A new database: every migration is pending                               | `false`      | 1         |
| `ahead`   | A newer image migrated the database; this image must not run on it       | `false`      | 3         |
| `unknown` | The newest applied migration is not one this image ships (another build) | `false`      | 3         |

`compatible` says whether this image's server may run against the database. `applied.latestMigration` is `null` when the database is empty or the image does not know the newest migration. Standard output holds the JSON object only when the status could be read. When it could not (invalid settings: 2, unreachable: 4, missing privileges: 3, another database error: 1), standard output is empty and standard error says why, so check for output before you parse it.

### `GET /api/health`

Liveness: `200` while the process runs. It checks nothing else and is public.

```json
{ "status": "ok", "checkedAt": "2026-10-10T12:00:00.000Z" }
```

### `GET /api/readiness`

`200` when every required check is ready, otherwise `503`. Public; it names no data.

```json
{
  "status": "not_ready",
  "checkedAt": "2026-10-10T12:00:00.000Z",
  "checks": {
    "database": {
      "required": true,
      "ready": true,
      "reason": null,
      "message": "Database connection succeeded.",
      "checkedAt": "…"
    },
    "schema": {
      "required": true,
      "ready": false,
      "reason": "schema_behind",
      "message": "The database schema is 1 migration(s) behind this image. Run `quro migrate`.",
      "checkedAt": "…"
    },
    "documentStorage": {
      "required": true,
      "ready": true,
      "reason": null,
      "message": "Document storage is reachable.",
      "checkedAt": "…"
    }
  },
  "optional": {
    "pensionImport": {
      "required": false,
      "ready": false,
      "reason": "not_configured",
      "message": "…",
      "checkedAt": "…"
    }
  }
}
```

`status` is `ready` or `not_ready`. The checks under `optional` never make the instance not ready. `reason` is `null` for a ready check, otherwise one of:

| Check             | `reason`                                                                                                                                                                      |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `database`        | `connection_failed`                                                                                                                                                           |
| `schema`          | `schema_empty`, `schema_behind` (run `quro migrate`), `schema_ahead`, `schema_unknown`, `schema_unreadable` (run `quro migrate`), `database_unavailable`, `connection_failed` |
| `documentStorage` | `not_configured`, `connection_failed`                                                                                                                                         |

Messages are for people and may change; scripts use `status`, `ready` and `reason`.

### `quro health`

For container health checks: it asks the server in the same container for `/api/readiness`. Exit code 0 and `ready` when it answers `200`; exit code 1 otherwise, naming the failing checks. It reads only `PORT` and `HOST`.

### `quro doctor --json`

Read-only checks of everything an install depends on. The report has `status` (`ok` or `fail`), `exitCode`, `build` (the same object as `quro version --json`) and `checks`, a list of `{ id, status, message }` with `status` one of `ok`, `warn`, `fail` or `skip`. The exit code is the most serious failure: 2 for settings, 4 for unreachable, 3 for refused, 1 for any other failed check. The list of checks may grow.

## Upgrade from 0.7.0 to 0.8.0

0.8.0 changes how Quro is configured, started and stored, and moves the database to PostgreSQL 18. The procedure below takes a 0.7.0 install to 0.8.0 with every row and document intact; the upgrade test runs its database and document steps on a synthetic 0.7.0 install on every change. Plan an outage of half an hour or so, and do it when nobody uses Quro.

It covers:

- installs from the release Compose file (`docker-compose.release.yml`), which move to the [example Compose file](compose.example.yaml), and installs with a Compose file of your own, which you edit ([what to change](#change-your-own-compose-file));
- a database on PostgreSQL 16 or 17, which moves to 18 by dump and restore, and a database already on 18, which stays where it is;
- documents in MinIO or another S3 store, which you either copy to the filesystem or keep in S3;
- both [deployment modes](security.md#deployment-modes): plain HTTP on a private network, and HTTPS behind your reverse proxy.

An install from a checkout that runs the repository's `docker-compose.yml` follows [PostgreSQL 18 and the upgrade from 16](postgresql-upgrade.md) for the database, and the [changes in 0.8.0](#changes-in-080) for `.env`.

### What signs users out

Nothing in the upgrade itself: migration `0038` stores each session as a digest of its token, and browsers stay signed in. Users are signed out only if a 0.7.0 server keeps running after `quro migrate` (it no longer finds any session, so stop it first, as below), or if you [go back to 0.7.0](#roll-back-to-070) afterwards: the sessions of the backup's time come back, and browsers that signed in on 0.8.0 sign in again. Accounts created from now on need a [registration code](#registration-invite-only).

### Before you start

- You need the 0.8.0 backend and frontend image digests from the release notes, the release's `docs/compose.example.yaml` and `scripts/pg-table-fingerprint.sql` (in the release's source code), and free disk space for a dump and a copy of your data.
- Find out which PostgreSQL major your database runs:

  ```bash
  docker compose -f docker-compose.release.yml exec -T db postgres --version
  ```

  Use your own Compose file name and service name if they differ. 16 or 17: you will move to 18 in step 6. 18: you skip that step. The 0.7.0 backend image's `pg_dump` is version 17 and cannot back up an 18 server, so every backup below uses the database container's own tools.

- Find out whether you have documents in S3. This prints how many rows refer to a stored document:

  ```bash
  docker compose -f docker-compose.release.yml exec -T db sh -c 'psql -X -At -U "$POSTGRES_USER" -d "$POSTGRES_DB"' <<'SQL'
  select (select count(*) from payslips where document_storage_key is not null)
       + (select count(*) from pension_transactions where document_storage_key is not null)
       + (select count(*) from pension_statement_imports where storage_deleted_at is null);
  SQL
  ```

  `0` means there is nothing to move: you will remove the S3 settings. Otherwise choose: copy the documents to the filesystem (recommended; one backup then covers everything) or keep them in your S3 store.

### Upgrade, step by step

Run the commands in the directory of your 0.7.0 install. The examples use the release file's names (`docker-compose.release.yml`, `.env`, `secrets/*.txt`, `./data/postgres`, `./data/minio`, the user `quro_admin` and the database `quro`); use yours where they differ.

#### 1. Retire the auto-updater

If you ever enabled the `auto-update` profile or ran `apply-release.sh`, follow [Retire the auto-updater](retire-the-auto-updater.md) first. 0.8.0 has no updater, and one left running could replace your Compose file during the upgrade.

#### 2. Record what you have

Copy `scripts/pg-table-fingerprint.sql` of the 0.8.0 release next to your Compose file, then record a fingerprint of the database: each table with its row count and a checksum of its rows, and each sequence. It contains no row data.

```bash
mkdir -p before-0.8.0
docker compose -f docker-compose.release.yml exec -T db sh -c 'psql -X -At -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
  < pg-table-fingerprint.sql | LC_ALL=C sort > before-0.8.0/fingerprint.txt
```

Also note a few numbers you can check in the app afterwards, such as your net worth and the number of documents.

#### 3. Stop the app and back up with the old stack's tools

Stop everything that writes, then dump the database with the database container's own `pg_dump`, which always matches its server. `-T` matters: without it Compose attaches a terminal that can corrupt the binary dump.

```bash
docker compose -f docker-compose.release.yml stop frontend backend
docker compose -f docker-compose.release.yml exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom' \
  > before-0.8.0/quro-0.7.0.dump
docker compose -f docker-compose.release.yml exec -T db pg_restore --list < before-0.8.0/quro-0.7.0.dump | head -n 5
```

The last command prints the start of the dump's table of contents; if it prints an error, the dump is not usable and you stop here. Also stop the import worker if you run it. If you already run a backup job for the database, its latest dump is not a substitute: it may be older than the moment you stopped the app.

#### 4. Stop the stack and copy the install

```bash
docker compose -f docker-compose.release.yml down
sudo cp -a . ../quro-before-0.8.0
```

`down` removes containers and networks only; the data directories stay. The copy holds the Compose file, `.env`, `secrets/`, `./data/postgres`, `./data/minio` and the dump, with their owners and modes. It is your way back ([Roll back to 0.7.0](#roll-back-to-070)). If your Compose file mounts directories from elsewhere (for example `/srv/…`), copy those too while the stack is down. Treat the copy as sensitive: it holds your financial records and bank tokens. A store that encrypts at rest, such as MinIO with a KMS key, can only be read back by the same store with the same key, so keep its configuration with the copy.

#### 5. Prepare the 0.8.0 configuration

**With the release Compose file**, set up the example Compose file next to the old one. It keeps settings in `config/quro.env`, passwords in `config/secrets/`, documents in `./data/documents`, backups in `./backups` and the database in a Docker volume:

```bash
cp /path/to/compose.example.yaml compose.yaml
mkdir -p config data/documents backups
sudo chown 1000:1000 config data/documents backups
docker run --rm -v "$PWD/config:/config" ghcr.io/pieter-ohearn/quro-backend:v0.8.0@sha256:<backend digest> init
```

Skip the `chown` when `id -u` prints `1000`, or on Docker Desktop. Then:

- In `compose.yaml`, pin all three images to the 0.8.0 tag and digest. If your `.env` set `QRO_FRONTEND_PORT`, change the published port of the `frontend` service to match (`'<port>:80'`).
- Review `config/quro.env` (`sudo` to edit it on Linux). Carry over what you changed in `.env`: `SECURE_COOKIES`, `CORS_ORIGIN`, `FRONTEND_ORIGIN`, bunq and tracing settings, `PENSION_PARSER_URL`. Check each value against [Strict settings](#strict-settings). For HTTPS behind your reverse proxy, set `SECURE_COOKIES=true` and [`TRUSTED_PROXIES`](#trusted-proxies-default). `quro init` generated new database passwords; the new database in step 6 uses them.
- To keep documents in MinIO for now, or to copy them to the filesystem in step 8, add [`compose.minio.yaml`](#keep-the-bundled-minio-for-now) next to `compose.yaml`.

`docker compose` now uses `compose.yaml`; the 0.7.0 file stays in place and is only used with `-f docker-compose.release.yml`. Your `.env` is still read for its `COMPOSE_PROJECT_NAME` and by `compose.minio.yaml`; its other settings no longer reach the containers.

**With your own Compose file**, edit it as described in [Change your own Compose file](#change-your-own-compose-file), and pin the 0.8.0 images.

#### 6. Move the database to PostgreSQL 18

Skip this step if your database already runs PostgreSQL 18: `quro migrate` in step 7 upgrades it where it is.

From 16 or 17, start PostgreSQL 18 on a new, empty data directory and restore the dump into it, before any 0.8.0 migration runs. The example Compose file uses the Docker volume `postgres`; in your own file, point the `db` service at a new directory mounted at `/var/lib/postgresql` with the image `postgres:18.6-alpine3.23`. Never point PostgreSQL 18 at the old directory: it refuses to start, and the old directory is your way back.

```bash
docker compose up -d --wait db
docker compose exec -T db sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --no-privileges --single-transaction --exit-on-error' \
  < before-0.8.0/quro-0.7.0.dump
docker compose exec -T db sh -c 'psql -X -At -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
  < pg-table-fingerprint.sql | LC_ALL=C sort > before-0.8.0/fingerprint-restored.txt
diff before-0.8.0/fingerprint.txt before-0.8.0/fingerprint-restored.txt && echo identical
```

The restore runs in one transaction, so it either completes or changes nothing. `diff` prints nothing and `identical` appears: every table and sequence arrived unchanged. If they differ, stop and keep the old stack (see [Roll back to 0.7.0](#roll-back-to-070)). `--no-owner --no-privileges` makes the new owner role own everything; `quro migrate` grants the runtime role its access in the next step.

Restoring the dump after `quro migrate` instead does not work: `pg_restore` cannot replace the 0.8.0 tables (`cannot drop constraint users_pkey … because other objects depend on it`) and stops without changes. Restore first, then migrate.

#### 7. Apply the 0.8.0 migration

```bash
docker compose run --rm migrate
```

It prints the database and PostgreSQL version, `Schema: 1 pending migration(s): 0038_session_hashes_and_auth_codes.`, the plan for the runtime role, then `Applied 1 migration(s): 0038_session_hashes_and_auth_codes.` and the runtime role's grants. Run it again and it says `No migrations to apply.` If it stops, see [When an upgrade fails](#when-an-upgrade-fails).

#### 8. Documents: copy them to the filesystem, or keep them in S3

Skip this step if you have no documents and removed the S3 settings.

To **keep S3**, set `QRO_DOCUMENT_STORAGE=s3` and the [S3 settings](#s3-settings) for the backend and the `migrate` service (with the release Compose file, [`compose.minio.yaml`](#keep-the-bundled-minio-for-now) does that, and `COMPOSE_FILE` in `.env` keeps it in use), and go to step 9. You can copy the documents later with the same commands.

To **copy them to the filesystem**, run the copy while the backend is stopped. It reads every document the database refers to from S3, checks each one by SHA-256 and adds nothing to `./data/documents` unless every document arrived. It never changes or deletes anything in S3 or the database, so the first run doubles as a report:

```bash
docker compose -f compose.yaml -f compose.minio.yaml run --rm migrate documents migrate-from-s3
```

With your own Compose file, run it through the service that has the S3 settings, the runtime password and the documents directory, for example `docker compose run --rm --no-deps backend documents migrate-from-s3`.

- `Done: … Every needed document is in /var/lib/quro/documents.` (exit code 0): every document is copied.
- `Stopped: N of M documents could not be copied` (exit code 1): nothing was added. Each failure names a key and the rows that use it, such as `payslips#12`. For `missing from S3`, either put the object back into the bucket from a backup of the store, or remove the attachment in Quro: start Quro on S3 (`docker compose -f compose.yaml -f compose.minio.yaml up -d --wait`), open the payslip or pension transaction, choose **Remove PDF** and save; for a statement import waiting for review, open it and choose **Discard & Cancel**. Then stop the backend and run the copy again. Other reasons are explained in [document storage](document-storage.md#move-documents-from-s3-to-the-filesystem).

When the copy succeeds, switch to the filesystem. With the example Compose file, stop using `compose.minio.yaml`; `config/quro.env` already says `QRO_DOCUMENT_STORAGE=filesystem`:

```bash
docker compose -f compose.yaml -f compose.minio.yaml down
```

With your own file, set `QRO_DOCUMENT_STORAGE=filesystem`, remove the `S3_` settings and mount the documents directory (see [Document storage](#document-storage)). Keep MinIO's data until you are sure; removing it is your decision.

#### 9. Start and check

```bash
docker compose up -d --wait
docker compose ps
docker compose run --rm migrate migrate --status
docker compose run --rm migrate doctor
```

The backend is `healthy`, `--status` says `Status: current.` and `doctor` ends with `All checks passed.` Then, in the app:

- Sign in: browsers that were signed in to 0.7.0 still are.
- Compare the numbers you noted in step 2, and open a few documents.
- Take the first 0.8.0 backup: `docker compose run --rm migrate backup`. Then [schedule backups](backup-and-restore.md#schedule-backups); 0.8.0 backs up the documents together with the database.
- New accounts need a registration code: `docker compose exec backend quro user invite`.

Keep `../quro-before-0.8.0` until you are sure. Delete it, and the old `./data/postgres` and `./data/minio`, by hand when you are, not before.

### Keep the bundled MinIO for now

The example Compose file has no object store. To keep reaching the MinIO of a release-file install, put this override next to `compose.yaml` as `compose.minio.yaml`. It runs the same MinIO service on the same data, and points `migrate` and `backend` at it; the values come from your 0.7.0 `.env`, which stays in the directory.

```yaml
# The MinIO service of the 0.7.0 install, kept until its documents are copied to the filesystem.
services:
  minio:
    # The image your docker-compose.release.yml uses.
    image: minio/minio:RELEASE.2025-09-07T16-13-09Z
    restart: unless-stopped
    environment:
      MINIO_ROOT_USER: ${MINIO_ROOT_USER:-quro_root}
    entrypoint:
      - /bin/sh
      - -ec
      - |
        export MINIO_ROOT_PASSWORD="$$(tr -d '\r\n' < /run/secrets/minio_root_password)"
        exec minio server /data --console-address ":9001"
    volumes:
      - ./data/minio:/data
    secrets: [minio_root_password]
    networks: [internal]

  migrate:
    environment: &s3
      QRO_DOCUMENT_STORAGE: s3
      S3_ENDPOINT: http://minio:9000
      S3_REGION: ${S3_REGION:-eu-west-1}
      S3_BUCKET: ${S3_BUCKET:-quro-documents}
      S3_ACCESS_KEY_ID: ${MINIO_APP_USER:-quro_app}
    secrets: [s3_secret_access_key]
    depends_on:
      minio:
        condition: service_started

  backend:
    environment: *s3
    secrets: [s3_secret_access_key]

secrets:
  minio_root_password:
    file: ./secrets/minio_root_password.txt
  s3_secret_access_key:
    file: ./secrets/minio_app_secret_key.txt
```

Copy any other setting your MinIO service had, such as `MINIO_KMS_SECRET_KEY`. On Linux the backend reads the secret key file as UID 1000: `sudo chown 1000:1000 secrets/minio_app_secret_key.txt`. Use the override with every command that should see the documents in MinIO, for example `docker compose -f compose.yaml -f compose.minio.yaml up -d --wait`. To keep MinIO for good, add the line `COMPOSE_FILE=compose.yaml:compose.minio.yaml` to `.env`: Compose then reads both files for every command, so the commands in this guide and in [backup and restore](backup-and-restore.md) work unchanged. Otherwise drop the override once step 8 has copied the documents.

### Change your own Compose file

If you run Quro from a Compose file of your own (for example one derived from the 0.7.0 release file, deployed by your own tooling), change it as follows. [`docs/compose.example.yaml`](compose.example.yaml) is a complete, tested reference to compare with.

| Service                                         | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `auto-updater`                                  | Remove it ([Auto-updater removed](#auto-updater-removed)).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `migrate`                                       | Pin the 0.8.0 backend image. Remove `entrypoint:` and set `command: ['migrate']`. Add `POSTGRES_HOST` (the database service, for example `db`) next to `POSTGRES_DB`, `POSTGRES_ADMIN_USER` and `POSTGRES_APP_USER`. Keep both password secrets. Give it the same `QRO_DOCUMENT_STORAGE` and S3 settings (and S3 secret) as the backend: `quro backup` and `quro doctor` run here and must look at the same store. Mount the documents directory at `/var/lib/quro/documents` and a backup directory at `/var/lib/quro/backups`.                                                                                                                                     |
| `backend`                                       | Pin the 0.8.0 backend image. Remove `entrypoint:` and any `command:` that runs `bun` (the default command is `serve`). Add `POSTGRES_HOST`. Remove `MINIO_APP_USER`. Set `QRO_DOCUMENT_STORAGE` to `filesystem` (and mount the documents directory at `/var/lib/quro/documents`) or to `s3` (with the [S3 settings](#s3-settings)). Keep `SECURE_COOKIES`, and set `TRUSTED_PROXIES` ([Trusted proxies](#trusted-proxies-default)). Add the health check `test: ['CMD', 'quro', 'health']`, and make the frontend wait for `condition: service_healthy`. Set `user:` if the files it mounts belong to another UID than 1000 ([UID 1000](#backend-runs-as-uid-1000)). |
| `frontend`                                      | Pin the 0.8.0 frontend image. Set `QRO_API_URL` to the backend's address, for example `http://backend:3000` ([Frontend API URL](#frontend-api-url)).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `db`                                            | Already on PostgreSQL 18: no change. On 16 or 17: `postgres:18.6-alpine3.23` with a new data directory mounted at `/var/lib/postgresql` (step 6). Replace a health check of the form `pg_isready -U "$" -d "$"` with literal values, for example `pg_isready -U quro_admin -d quro`.                                                                                                                                                                                                                                                                                                                                                                                 |
| `minio`                                         | Keep it while you keep documents in S3 or until step 8 has copied them.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `pension-import-worker`, if you run it          | `command: ['worker', 'pension-imports']`, the same documents directory and storage settings as the backend, and `PENSION_PARSER_URL` ([Statement import parser URL](#statement-import-parser-url)).                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `db-tools`, or any job that used `/app/backups` | Mount the backup directory at `/var/lib/quro/backups`. An existing mount at `/app/backups` still lands there, because the image links that path to it, but `quro backup` is the backup command now ([backup and restore](backup-and-restore.md)).                                                                                                                                                                                                                                                                                                                                                                                                                    |

For an install that keeps S3 with the 0.7.0 secret file, the backend's settings and secret look like this (values from your `.env`); the `migrate` service gets the same storage settings and secret:

```yaml
services:
  backend:
    environment:
      POSTGRES_HOST: db
      QRO_DOCUMENT_STORAGE: s3
      S3_ENDPOINT: http://minio:9000
      S3_REGION: eu-west-1
      S3_BUCKET: quro-documents
      S3_ACCESS_KEY_ID: quro_app # the old MINIO_APP_USER
      SECURE_COOKIES: 'true' # HTTPS behind your reverse proxy
      TRUSTED_PROXIES: 172.16.0.0/12 # the networks your proxy and nginx are in
    secrets:
      - postgres_app_password
      - source: minio_app_secret_key
        target: s3_secret_access_key
```

Then follow the [steps](#upgrade-step-by-step) with your file: every `docker compose -f docker-compose.release.yml` command before step 4 uses your old file, every later command your edited one.

### Changes in 0.8.0

Each change below says what 0.7.0 did, what 0.8.0 does and what you change.

#### Auto-updater removed

The `quro-auto-updater` image, `docker-compose.release.yml` and the auto-update bundle are no longer released; existing tags stay published. Quro never touches Docker. If you ever ran the updater, [retire it](retire-the-auto-updater.md) before upgrading, and upgrade by hand from now on, as in this guide.

#### Backend image entry point

The backend image's entry point is `quro`, and its default command is `serve`. The shell scripts of 0.7.0 (`run-migrate.sh`, `with-runtime-env.sh`, `common-env.sh`) are gone.

| Service                 | 0.7.0                                                                                                  | 0.8.0                                                      |
| ----------------------- | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| `backend`               | The image's default, or `entrypoint: [... with-runtime-env.sh]` and `command: ['bun', 'run', 'start']` | No `entrypoint:`; no command, or `command: ['serve']`      |
| `migrate`               | `entrypoint: ['/bin/sh', '/app/docker/backend/run-migrate.sh']`                                        | No `entrypoint:`; `command: ['migrate']`                   |
| `pension-import-worker` | `entrypoint: [... with-runtime-env.sh]` and `command: ['bun', 'run', 'worker:pension-imports']`        | No `entrypoint:`; `command: ['worker', 'pension-imports']` |
| Backups                 | `db-tools backup`, `db-tools restore`                                                                  | `quro backup`, `quro restore`                              |

A command that starts with `bun`, `sh` or a path under `/app/` stops with exit code 2 and says what to use instead; an `entrypoint:` that names a removed script fails with a shell error. In `docker compose run`, give the command without `quro`: `docker compose run --rm migrate doctor`. `docker compose exec backend quro …` runs it in the running server's container.

#### Backend runs as UID 1000

The 0.7.0 images ran as root; the 0.8.0 backend runs as UID 1000, GID 1000. On Linux, the files it mounts must be readable (secret files) and writable (the documents and backup directories) by that user, or by the UID you set with `user:`. Docker creates a missing bind-mount directory as root, so create the directories first:

```bash
mkdir -p data/documents backups
sudo chown 1000:1000 data/documents backups
```

Secret files from 0.7.0 (`secrets/*.txt`, typically mode `0600` and owned by you) are unreadable to UID 1000 unless that is you. Either give them to UID 1000 (`sudo chown 1000:1000 <file>`) or run the backend with your own UID (`user: "<uid>:<gid>"`) and bind mounts you own. Compose ignores `uid`, `gid` and `mode` on file-based secrets. `quro doctor` reports an unreadable secret or an unwritable directory. Docker Desktop on macOS does not enforce these permissions. Details: [file ownership](install-contract.md#file-ownership).

#### Frontend API URL

The frontend no longer has the backend's address built in. Set `QRO_API_URL` on the `frontend` service, for example `QRO_API_URL: http://backend:3000`: `http(s)://host:port`, without a path or a trailing slash. Without it the container stops at startup with exit code 2. The release Compose file already set it (0.7.0 ignored it); a checkout's file did not.

The image renders its nginx configuration at startup from `/etc/nginx/templates/default.conf.template`, substituting only `QRO_` variables, into `/etc/nginx/conf.d/default.conf`. If you mount a configuration of your own, mount it as that template and use `proxy_pass ${QRO_API_URL};` in its `/api` location, or mount a finished file over `/etc/nginx/conf.d/default.conf` and set `QRO_API_URL` anyway, since the start-up check requires it. A custom configuration is not tested by the project.

#### Database settings

| 0.7.0                                                                                                                                                                                     | 0.8.0                                                                                                               |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Host `db` and port 5432 built into the image                                                                                                                                              | `POSTGRES_HOST` is required (exit code 2 without it); `POSTGRES_PORT` is read (default 5432)                        |
| Passwords from `/run/secrets/postgres_admin_password` and `postgres_app_password`                                                                                                         | The same files by default, set by `POSTGRES_ADMIN_PASSWORD_FILE` and `POSTGRES_APP_PASSWORD_FILE`                   |
| `DATABASE_HOST`, `DATABASE_PORT`, `APP_DB_USER`, `APP_DB_PASSWORD`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_ADMIN_PASSWORD`, `POSTGRES_APP_PASSWORD` in the backend's environment | Not read; `quro doctor` lists them. Use the names in the right-hand column of [Retired settings](#retired-settings) |
| –                                                                                                                                                                                         | `POSTGRES_SSLMODE` for a database on another host                                                                   |

A Compose file that mounts the two password secrets under their 0.7.0 names needs only `POSTGRES_HOST`. The `db` service keeps its own `POSTGRES_USER` and `POSTGRES_PASSWORD_FILE`: those are the PostgreSQL image's settings. `quro migrate` now checks first that the owner role owns the database and that the server runs PostgreSQL 16, 17 or 18, and stops with exit code 3 otherwise. Passwords that start with `-` or contain URL characters, which 0.7.0 corrupted, work.

#### S3 settings

For an install that keeps documents in S3:

| 0.7.0                                                                      | 0.8.0                                                                                                                                    |
| -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `MINIO_APP_USER`                                                           | `S3_ACCESS_KEY_ID`, with the same value                                                                                                  |
| Secret `/run/secrets/minio_app_secret_key`; `S3_SECRET_ACCESS_KEY`         | `S3_SECRET_ACCESS_KEY_FILE`, default `/run/secrets/s3_secret_access_key`: mount the old file under that name, or point the setting at it |
| `S3_ENDPOINT` defaulted to `http://minio:9000`, `S3_REGION` to `eu-west-1` | No defaults: set `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET` and `S3_ACCESS_KEY_ID` together, plus `QRO_DOCUMENT_STORAGE=s3`                 |
| `S3_INTERNAL_ENDPOINT` in a checkout's `.env`                              | Not read: put its value into `S3_ENDPOINT`                                                                                               |

A partial set of S3 settings stops every command with exit code 2. Uploads still ask the store to encrypt each object (`x-amz-server-side-encryption: AES256`), which MinIO supports only with a KMS key.

#### Document storage

Documents are stored on the filesystem by default (`QRO_DOCUMENT_STORAGE=filesystem`, in `QRO_DOCUMENTS_DIR`, default `/var/lib/quro/documents`), and the Compose files no longer run MinIO. Quro never creates the documents directory; mount it, writable by UID 1000. Keys are unchanged, so documents move between the stores without changing a row.

If any of `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID` or `MINIO_APP_USER` is set and `QRO_DOCUMENT_STORAGE` is not, every command stops with exit code 2, so documents never disappear behind an empty directory. A 0.7.0 `.env` has `S3_BUCKET=quro-documents`, even on installs that never stored a document. Set `QRO_DOCUMENT_STORAGE=s3` to keep using the store, or, when the [count](#before-you-start) is 0 or after `quro documents migrate-from-s3`, set `QRO_DOCUMENT_STORAGE=filesystem` and remove the `S3_` and `MINIO_` lines. [Document storage](document-storage.md) has the details of both stores and of the copy.

#### Bundled Compose file

The release no longer ships a Compose file. [`docs/compose.example.yaml`](compose.example.yaml) is the reference, which CI installs from on every change; copy it and own it. Compared with the 0.7.0 release file it has no `minio`, `minio-init` or `auto-updater` service and no MinIO secrets, runs PostgreSQL 18 on a Docker volume, runs `migrate` as `command: ['migrate']` before the backend starts, mounts `./data/documents` and `./backups`, gives the backend a `quro health` check and starts the frontend only when the backend is healthy, and reads settings from `config/quro.env` instead of `.env`. Override files that refer to `minio` or `minio-init` fail with an unknown service.

In a checkout, the repository's `docker-compose.yml` changed the same way: `db` uses `./data/postgres-18`, `db-tools` mounts `./backups` at `/var/lib/quro/backups` and `./data/documents`, and every Quro service mounts `./data/documents`.

#### Strict settings

0.7.0 quietly used a default when a setting was malformed. 0.8.0 checks every setting at startup, lists every problem (never the values) and stops with exit code 2:

- `SECURE_COOKIES` and `OTEL_SDK_DISABLED` accept only `true` or `false`. In 0.7.0 anything but `true` meant false, so `SECURE_COOKIES=1` or `TRUE` turned secure cookies off; now it stops startup.
- `BUNQ_SANDBOX`, `S3_FORCE_PATH_STYLE` and `QRO_DISABLE_SCHEDULERS` accept `true`, `false`, `1`, `0`, `yes` and `no` in any case. **`BUNQ_SANDBOX=1`, `yes` or `TRUE` selected the production bunq API in 0.7.0 and select the sandbox in 0.8.0.** Unset means production.
- Numbers must be whole numbers in range: `PORT` (1 to 65535), `SESSION_CLEANUP_INTERVAL_MS`, `PENSION_PARSER_TIMEOUT_MS` and `IMPORT_DRAFT_TTL_DAYS` (at least 1) and `IMPORT_WORKER_POLL_INTERVAL_MS` (at least 500).
- `FRONTEND_ORIGIN` and the tracing endpoints must be `http(s)` URLs whenever they are set.
- Some bunq settings without the others (`BUNQ_CLIENT_ID`, `BUNQ_CLIENT_SECRET`, `BUNQ_REDIRECT_URI`, `FRONTEND_ORIGIN`), or some S3 settings without the others, stop startup.

Run `docker compose run --rm migrate doctor` after changing settings: it lists every problem and every retired setting.

#### Statement import parser URL

`PENSION_PARSER_URL` has no default any more (0.7.0 used `http://pension-parser:8080`). Without it, PDF statement import is off and its endpoints are not there. If you run the statement import profile with your own Compose file, set it on the backend and the worker; the repository's `docker-compose.yml` still sets it.

#### bunq endpoints

When bunq is not configured, `/api/bunq/…` answers `404` (0.7.0: `503` on start and callback), and `/api/pensions/imports/…` answers `404` without a parser URL. `GET /api/capabilities` says why. Update monitors that expected `503`.

#### PostgreSQL 18

PostgreSQL 18 is the baseline; 16 and 17 servers still work. The 0.8.0 image ships PostgreSQL 18 client tools, which back up 16, 17 and 18, and refuse a server newer than themselves before writing anything. Moving a 16 or 17 database to 18 is a dump and a restore into a new data directory, never the old one ([step 6](#6-move-the-database-to-postgresql-18)). PostgreSQL 18 keeps its data under `/var/lib/postgresql` (16 and 17: `/var/lib/postgresql/data`). Restoring a backup into a PostgreSQL 16 server with the image's tools does not work; backups of a 16 server do.

#### Registration invite-only

Sign-up needs a code: `QRO_REGISTRATION_MODE` is `invite` by default (`closed` refuses even valid codes, `open` lets anyone sign up). Existing accounts are unaffected. Issue codes with `docker compose exec backend quro user invite`; the user enters it in the sign-up form. A new, empty database needs a code for its first account in every mode. Operators reset passwords with `quro user reset-password <email>`; the user redeems the code under **Forgot password?**. `POST /api/auth/signup` takes an `inviteCode` field and answers `403` without a valid one. See [the security model](security.md#operator-recovery-without-email).

#### Auth JSON only

`POST /api/auth/signin`, `/api/auth/signup` and `/api/auth/password-reset` accept only `Content-Type: application/json` and answer `415` to anything else. The web app already sends JSON; scripts that post forms must change.

#### Trusted proxies default

`TRUSTED_PROXIES` lists the proxies whose `X-Forwarded-For` the backend uses for rate limits. The repository's `docker-compose.yml` and `quro init` now set `172.16.0.0/12`, Docker's default network range; the 0.7.0 checkout default also trusted `10.0.0.0/8` and `192.168.0.0/16`, and the release file set nothing. If your Docker networks use other ranges, or your reverse proxy runs on another machine, list them, or every browser shares one rate-limit bucket (5 sign-ins per minute for everyone):

```bash
docker network inspect --format '{{range .IPAM.Config}}{{.Subnet}} {{end}}' quro_internal quro_web
```

Use the network names `docker network ls` shows for your project. HTTPS behind your reverse proxy also needs `SECURE_COOKIES=true`; see [mode B](security.md#mode-b-https-behind-your-reverse-proxy).

#### Paged list endpoints

For scripts that read the API: ledger lists return one page, `{ "data": [...], "nextCursor": "…" | null }`, of 100 rows by default; `limit` raises that to at most 1000, and `cursor` takes the previous `nextCursor`. Follow `nextCursor` until it is `null`. This covers savings, holding, property, mortgage, pension and budget transactions, debt payments, payslips, pension documents, statement import rows and holding price history; `GET /api/investments/holding-price-history` also requires `from` (`YYYY-MM-DD`). The web app follows every page itself.

#### Money input limits

Money in requests is rounded to cents when it is read (half away from zero), and amounts of 10^13 or more are refused with `400`. Unit prices, share quantities, rates and percentages keep their precision. Scripts that send more than two decimals get the rounded amount.

#### Ledger write status codes

Edits and deletes of one ledger row apply once, even when two arrive together. A second delete of the same row answers `404`; a savings, mortgage or property transaction that moved to another account meanwhile answers `409`; committing the same statement import twice answers `400`. Scripts that retry should treat these as already done.

#### Readiness checks

`GET /api/readiness` now checks the schema against the image and the configured document store, and no longer requires S3. It answers `503` while migrations are pending, when the schema is newer than the image, or when the documents directory is missing or not writable. A load balancer or monitor on `/api/readiness` sees `503` between pulling 0.8.0 and running `quro migrate`; use `/api/health` for liveness. The fields are listed under [GET /api/readiness](#get-apireadiness).

#### Retired settings

These settings and defaults are gone. Where ignoring one could hide data or connect to the wrong place, the command stops with exit code 2 and names the replacement; the others are simply not read. `quro doctor` lists every retired setting it finds.

<!-- Keep this table identical to the one in docs/install-contract.md. -->

| Retired                                                                                              | Replacement                                                                               | If left unchanged                                                                                                                              |
| ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| S3 settings without `QRO_DOCUMENT_STORAGE`                                                           | `QRO_DOCUMENT_STORAGE=s3`, or `filesystem` after `quro documents migrate-from-s3`         | Every command stops with exit code 2                                                                                                           |
| Database host `db` by default                                                                        | `POSTGRES_HOST`                                                                           | Exit code 2: `POSTGRES_HOST` is required                                                                                                       |
| Frontend upstream `backend:3000` built in                                                            | `QRO_API_URL` on the frontend                                                             | The frontend stops at startup                                                                                                                  |
| `MINIO_APP_USER`                                                                                     | `S3_ACCESS_KEY_ID`                                                                        | Without `QRO_DOCUMENT_STORAGE`: every command stops with exit code 2. With it: not read, and S3 storage needs `S3_ACCESS_KEY_ID` (exit code 2) |
| Secret `/run/secrets/minio_app_secret_key`                                                           | `/run/secrets/s3_secret_access_key`, or point `S3_SECRET_ACCESS_KEY_FILE` at the old file | Exit code 2 with S3 storage: the secret file is not readable                                                                                   |
| `DATABASE_HOST`, `DATABASE_PORT`                                                                     | `POSTGRES_HOST`, `POSTGRES_PORT`                                                          | Not read; an unset `POSTGRES_HOST` stops with exit code 2                                                                                      |
| `POSTGRES_PASSWORD`, `POSTGRES_ADMIN_PASSWORD`, `POSTGRES_APP_PASSWORD` in the backend's environment | `POSTGRES_ADMIN_PASSWORD_FILE`, `POSTGRES_APP_PASSWORD_FILE`                              | Not read; a missing secret file stops with exit code 2                                                                                         |
| `POSTGRES_USER` as the runtime user                                                                  | `POSTGRES_APP_USER`                                                                       | Not read by the backend (the database image still uses it)                                                                                     |
| `S3_INTERNAL_ENDPOINT`                                                                               | `S3_ENDPOINT`, for an install that keeps S3                                               | Not read; S3 storage without `S3_ENDPOINT` stops with exit code 2                                                                              |
| `minio` and `minio-init` services, `MINIO_ROOT_USER`                                                 | An S3 store you run yourself, or the filesystem                                           | No effect with the new example                                                                                                                 |
| `db-tools` service                                                                                   | `quro backup`, `quro restore`                                                             | Old dumps stay in `./backups/db`                                                                                                               |
| `migrate` service script                                                                             | `quro migrate`                                                                            | –                                                                                                                                              |

### Roll back to 0.7.0

There is no schema-compatible way back: 0.7.0 does not check the schema, and migration `0038` changed how sessions are stored. Go back by restoring what you kept in steps 3 and 4. Everything done in 0.8.0 since then is lost: transactions, uploads, accounts and settings. If you kept documents in S3 while running 0.8.0, also put back the store's data from step 4 (for MinIO, `./data/minio`): documents replaced or removed on 0.8.0 are gone from the store.

**From PostgreSQL 16 or 17 with the release Compose file** (the old data directory was never touched):

```bash
docker compose down
docker compose -f docker-compose.release.yml up -d
```

`docker compose down` stops 0.8.0 and keeps its data on the Docker volume and in `./data/documents`. The 0.7.0 file still points at `./data/postgres` and `./data/minio`; `quro documents migrate-from-s3` never changes MinIO.

**With your own Compose file**, put back your old file and the data directories 0.8.0 changed, from the copy of step 4. For example, for a file named `docker-compose.yml` with the database in `./data/postgres-18` (migrated where it was, on PostgreSQL 18) and documents in `./data/minio`:

```bash
docker compose down
sudo mv data/postgres-18 data/postgres-18.0.8.0
sudo cp -a ../quro-before-0.8.0/data/postgres-18 data/postgres-18
sudo mv data/minio data/minio.0.8.0
sudo cp -a ../quro-before-0.8.0/data/minio data/minio
cp ../quro-before-0.8.0/docker-compose.yml docker-compose.yml
docker compose up -d --wait
```

Use your own file and directory names. On PostgreSQL 16 or 17 the old database directory was never touched, so only the Compose file (and the store's data) go back. Instead of the database copy you can restore the dump from step 3 into an empty data directory with the database container's `pg_restore`, as in step 6, before `docker compose up`: 0.7.0's `migrate` service then recreates the runtime role and its grants.

Browsers that signed in on 0.8.0 sign in again; sessions from before the upgrade are valid again. Report what went wrong in an issue so the next attempt goes better.
