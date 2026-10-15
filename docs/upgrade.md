# Upgrade Quro

This guide is for operators who run Quro and move it to a newer release. Quro never updates itself: you pick the version, back up, migrate and restart, by hand or from your own CI/CD. Upgrades are supported from 0.8.0 on, on PostgreSQL 18. An install of 0.7.0 or earlier first moves to 0.8.0 with the [upgrade notes published with 0.8.0](https://github.com/Pieter-OHearn/quro/blob/v0.8.0/docs/upgrade.md#upgrade-from-070-to-080). Each release's own notes follow the generic steps, under [Upgrade notes](#upgrade-notes).

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

Each of these is exercised on every change by the backend's migration and configuration tests (`packages/backend/src/cli/migrate.integration.test.ts`, `packages/backend/src/config/load.test.ts`) and the clean install test (`scripts/clean-install/run.sh`).

| What happened                                                                         | What you see                                                                                                                                                                                                                             | What to do                                                                                                                                                                                                                              |
| ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A migration failed**                                                                | `quro migrate` exits 1: `Migration failed: <the database's reason> (SQLSTATE …). Pending migrations run in one transaction, so none from this run was recorded`. The `migrate` service shows `exited (1)` and the backend does not start | Nothing was changed. Fix the cause the message names and run `docker compose up -d --wait` again, or [roll back](#roll-back-or-restore): the old image still matches the database                                                       |
| **The upgrade was interrupted** (host restart, `docker kill`, a CI job cancelled)     | The `migrate` container stopped without exit code 0                                                                                                                                                                                      | Nothing from the interrupted run was recorded. Run `docker compose up -d --wait` again; it applies all pending migrations                                                                                                               |
| **Two `quro migrate` ran at the same time** (two jobs, a job and `docker compose up`) | One prints `Another quro migrate is running against this database; waiting for it to finish...`                                                                                                                                          | Nothing. The second waits for the first, then prints `No migrations to apply.` Each migration is applied once                                                                                                                           |
| **The new image is unhealthy**                                                        | `docker compose ps` shows the backend `unhealthy` or `health: starting`, `docker compose up --wait` fails, the frontend does not start, and `docker compose exec backend quro health` prints the failing check                           | Read the check it names: a `schema` message that says to run `quro migrate` means it has not run (run it); `documentStorage` means the documents directory or the S3 store is not usable. Fix it, or [roll back](#roll-back-or-restore) |
| **The new image stops at startup**                                                    | The backend restarts over and over or shows `exited (2)`. `docker compose logs backend` lists every invalid setting, without values                                                                                                      | Fix the settings it names; nothing was changed. The release's upgrade notes list settings it changed                                                                                                                                    |
| **The schema is newer than the image**                                                | `quro migrate --status` and `quro migrate` exit 3: `The database schema is newer than this image`. Readiness reports `schema_ahead`                                                                                                      | You pinned an older image than the one that migrated the database. Pin the newer one again, or restore a snapshot                                                                                                                       |

## Interfaces for automation

These outputs are meant for scripts and monitoring. Until 1.0.0, the JSON output of `quro version --json`, `quro migrate --status --json` and `quro doctor --json`, and the readiness report, may change in any 0.x release; each release's [upgrade notes](#upgrade-notes) list the changes. They are stable from 1.0.0. `quro migrate --status` keeps exit code 1 for pending migrations. Text output without `--json` is for people and may change.

### Exit codes

Every `quro` command uses the same exit codes:

| Code | Meaning                                                                                                                       | What automation should do |
| ---- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| 0    | Done, or nothing to do                                                                                                        | Continue                  |
| 1    | The operation failed (for `--status` and `doctor`: a check failed, such as pending migrations)                                | Stop; read the output     |
| 2    | Usage or settings are invalid. Nothing was changed                                                                            | Fix the settings          |
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

## Upgrade notes

Each release that needs action from operators, or changes an interface scripts rely on, adds a section here. Read every section between your version and the target before you start.

### Upgrade from 0.8.0 to 0.9.0

#### Container hardening

What the operator does: add `healthcheck: disable: true` to services that run the backend image without the server, and optionally copy the new restrictions of the example Compose file. Nothing else changes for a Compose install on Docker Engine.

- **The images declare health checks.** The backend image checks readiness with `quro health`, the frontend image `GET /healthz`. Services that run the backend image for something other than the server (the `migrate` service, `quro worker pension-imports`, one-off maintenance services) need `healthcheck: disable: true`; otherwise Docker reports them `unhealthy`, and a tool that restarts unhealthy containers would restart the import worker.
- **nginx runs unprivileged.** The frontend image runs as UID 101 instead of root and writes only below `/tmp`. It still listens on port 80, so `ports:` stay as they are; Docker Engine lets unprivileged processes bind low ports inside a container's network namespace. With host networking or a runtime that does not, add `sysctls: { net.ipv4.ip_unprivileged_port_start: 0 }` to the frontend or publish it through a container network. The server configuration is now rendered into `/tmp/nginx/conf.d`, so files mounted over `/etc/nginx/conf.d` are no longer read.
- **The backend image ships production dependencies only.** TypeScript, `drizzle-kit`, the frontend's packages and the test files are no longer in it; no documented command uses them.
- **Optional restrictions.** The [example Compose file](compose.example.yaml) now sets `read_only`, `tmpfs`, `cap_drop`, `security_opt`, `mem_limit` and `pids_limit` (and `cap_add` for `db`), described in [container hardening](security.md#container-hardening). Copy them into your `compose.yaml` together with the 0.9.0 image tags: the 0.8.0 frontend runs as root and does not start with them.

#### Secrets key for bank links

What the operator does: create a secrets key file and mount it into the `migrate` and `backend` services before you start 0.9.0, then encrypt the stored bank-link secrets once with `quro secrets encrypt` while the backend is stopped. An install that never connected bunq needs no encryption step; creating the key now still lets users connect bunq later.

0.9.0 stores the bunq access tokens and keys in the database encrypted with a key that only you hold (see [integration secrets](security.md#integration-secrets)). Releases up to 0.8.0 stored them unencrypted. With bunq configured, the 0.9.0 backend does not start without the key: it stops with exit code 2 and `QRO_SECRETS_KEY_FILE: required because bunq linking is configured`, changing nothing. Losing the key later means every user reconnects bunq; no other data depends on it.

These commands extend [Upgrade to a new release](#upgrade-to-a-new-release) for an install made with the install guide. Run them in the directory with `compose.yaml` and `config/`.

1. Take the backup with 0.8.0, as in step 1 of the general procedure. It holds the bank-link secrets unencrypted: it is your way back, so keep it, protected, until 0.9.0 has synced bunq.

   ```bash
   docker compose run --rm migrate backup --label before-upgrade
   ```

2. Create the key. `quro init` from the 0.9.0 image creates only the files that are missing, so on an existing `config/` it adds `config/secrets/secrets_key` (32 random bytes, mode `0600`) and nothing else, and never prints the value:

   ```bash
   docker run --rm -v "$PWD/config:/config" ghcr.io/pieter-ohearn/quro-backend:v0.9.0 init
   ```

   It prints `Created /config/secrets/secrets_key (generated, mode 0600; value not shown).` and `Kept` for every other file. Without `quro init`, `openssl rand -hex 32 > config/secrets/secrets_key && chmod 600 config/secrets/secrets_key` writes the same kind of key. On Linux the backend's UID must be able to read it (`sudo chown 1000:1000 config/secrets/secrets_key`, or your `user:`).

3. Copy `config/secrets/secrets_key` somewhere safe, apart from your backups, for example into a password manager. Every archive written from now on needs it to keep the bank links.

4. In `compose.yaml`, mount the key into the `migrate` and `backend` services and declare it, as the [example Compose file](compose.example.yaml) does:

   ```yaml
   services:
     migrate:
       secrets:
         - postgres_admin_password
         - postgres_app_password
         - secrets_key
     backend:
       secrets:
         - postgres_app_password
         - secrets_key

   secrets:
     secrets_key:
       file: ./config/secrets/secrets_key
   ```

   Keep your other entries. The key is read from `/run/secrets/secrets_key`; with a different path, set `QRO_SECRETS_KEY_FILE` in `config/quro.env`.

5. Pin and pull the 0.9.0 images (step 2 of the general procedure). Then check what will change. `secrets status` reads the stored secrets with the 0.9.0 image and changes nothing; before encryption it reports the unencrypted ones and exits 1:

   ```bash
   docker compose run --rm migrate secrets status
   docker compose run --rm migrate migrate --status
   ```

   The first line names the key id, for example `Secrets key: <16 hexadecimal characters> (from /run/secrets/secrets_key).`; `Secrets key: not configured` means the file is not mounted (step 4). `Status: unencrypted` with your connection count is expected.

6. Stop the backend, apply the migrations, encrypt, and start everything:

   ```bash
   docker compose stop backend
   docker compose run --rm migrate
   docker compose run --rm migrate secrets encrypt
   docker compose up -d --wait
   ```

   `secrets encrypt` prints `Encrypted N secret(s) in M bank connection(s) with key …` and ends with `Status: current.` It converts one connection per transaction: if it is interrupted, run it again; it continues where it stopped and never encrypts a value twice.

7. Check the result:

   ```bash
   docker compose run --rm migrate secrets status
   docker compose run --rm migrate doctor
   ```

   `secrets status` exits 0 with `Status: current.` and the same key id as in step 5; `doctor` ends with `All checks passed.` and its `secrets` line says every bank-link secret is encrypted. Then sign in, open **Settings → Connected accounts** and press **Sync**: it succeeds without asking you to reconnect. The next `quro backup` prints `Bank-link secrets: encrypted with secrets key …`.

If the sync answers _The stored bunq credentials cannot be read with this instance's secrets key_, the backend runs with a different key than the one that encrypted them: compare the key ids from `secrets status` and mount the right file. If that key is lost, reconnect bunq in **Settings**.

To go back to 0.8.0, restore the `before-upgrade` archive with the 0.8.0 images as in [Restore the snapshot taken before the upgrade](#restore-the-snapshot-taken-before-the-upgrade). 0.8.0 cannot use encrypted bank links, and 0.9.0's migrations keep it from running on the upgraded database anyway.

With your own Compose file, mount a file with 64 hexadecimal characters into every container that runs the server or `quro secrets` (at `/run/secrets/secrets_key`, or set `QRO_SECRETS_KEY_FILE`). Interface changes: `quro doctor` has a new check `secrets`; the backup manifest has a new field `secrets.integrationKeys`; `POST /api/bunq/sync`, `/sync/savings` and `/sync/budget` answer `409` with `code: bunq_reauthorization_required` when stored credentials cannot be opened.

#### Settings of releases before 0.8.0

What the operator does: before upgrading, run `docker compose run --rm migrate doctor` with 0.8.0 and remove every setting it reports as no longer read. Nothing else changes for an install that 0.8.0 already accepted.

- 0.9.0 no longer recognises the settings 0.8.0 retired (`DATABASE_HOST`, `DATABASE_PORT`, `APP_DB_USER`, `APP_DB_PASSWORD`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_ADMIN_PASSWORD`, `POSTGRES_APP_PASSWORD`, `MINIO_APP_USER` and `S3_SECRET_ACCESS_KEY` in the backend's environment). They are ignored like any other unknown variable: `quro doctor` and the startup log no longer list them, and a missing replacement is reported without naming the old setting.
- `MINIO_APP_USER` on its own no longer stops every command when `QRO_DOCUMENT_STORAGE` is unset. `S3_ENDPOINT`, `S3_BUCKET` and `S3_ACCESS_KEY_ID` still do.

#### JSON output before 1.0.0

The JSON output of `quro version --json`, `quro migrate --status --json` and `quro doctor --json`, and the readiness report, carry no stability promise before 1.0.0: they may change in any 0.x release, and these notes list each change. See [Interfaces for automation](#interfaces-for-automation). `quro migrate --status` still exits 1 when migrations are pending.
