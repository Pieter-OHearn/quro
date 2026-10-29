# Upgrade Quro

This guide is for operators who run Quro and move it to a newer release. Quro never updates itself: you pick the version, back up, migrate and restart, by hand or from your own CI/CD. Upgrades are supported from 0.8.0 on, on PostgreSQL 18. An install of 0.7.0 or earlier first moves to 0.8.0 with the [upgrade notes published with 0.8.0](https://github.com/Pieter-OHearn/quro/blob/v0.8.0/docs/upgrade.md#upgrade-from-070-to-080). Each release's own notes follow the generic steps, under [Upgrade notes](#upgrade-notes).

The commands assume an install made with [the install guide](install.md): they run in the directory that holds `compose.yaml` and `config/`, and use its `migrate` service for operator commands.

## How upgrades work

- **Two images per release.** `ghcr.io/pieter-ohearn/quro-backend` (the server, the optional import worker and every `quro` command) and `ghcr.io/pieter-ohearn/quro-frontend`. Use both at the same version. Pulling them needs no registry account.
- **Pin the version and the digest.** A tag can be moved; a digest cannot. Each release's notes list the digest of both images. Pin both in `compose.yaml`, for example `image: ghcr.io/pieter-ohearn/quro-backend:v1.0.0-rc.1@sha256:<digest from the release notes>`, and the same tag and digest for the `migrate` service. Docker then refuses an image whose digest does not match.
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
  "version": "v1.0.0-rc.5",
  "revision": "<commit the image was built from>",
  "migrations": { "latest": "0045_exposure_classification", "count": 46 },
  "runtime": { "bun": "1.4.3", "platform": "linux", "arch": "arm64" }
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

Read-only checks of everything an install depends on. The report has `status` (`ok` or `fail`), `exitCode`, `build` (the same object as `quro version --json`) and `checks`, a list of `{ id, status, message }` with `status` one of `ok`, `warn`, `fail`, `skip` or `unknown`. `unknown` means nothing proves the check healthy, such as a job with no recorded run or no backup found; it does not change the exit code. The exit code is the most serious failure: 2 for settings, 4 for unreachable, 3 for refused, 1 for any other failed check. The list of checks may grow. [Monitor an install](operations.md) describes the operational checks.

## Upgrade notes

Each release that needs action from operators, or changes an interface scripts rely on, adds a section here. Read every section between your version and the target before you start.

### Upgrade from 0.8.0 to 0.9.0

Back up with 0.8.0 first (step 1 of the general procedure), then work through the subsections that apply to your install. Every install needs [Container hardening](#container-hardening) and, with bunq configured, [Secrets key for bank links](#secrets-key-for-bank-links). The others apply only to some installs: [Statement import profile](#statement-import-profile) if you run statement import from a checkout, [Duplicate statement imports](#duplicate-statement-imports) only if `quro migrate` refuses, and [Settings of releases before 0.8.0](#settings-of-releases-before-080). [PostgreSQL 18 required](#postgresql-18-required) and [API changes](#api-changes) need no action from most installs.

#### Container hardening

What the operator does: add `healthcheck: disable: true` to services that run the backend image without the server, and optionally copy the new restrictions of the example Compose file. Nothing else changes for a Compose install on Docker Engine.

- **The images declare health checks.** The backend image checks readiness with `quro health`, the frontend image `GET /healthz`. Services that run the backend image for something other than the server (the `migrate` service, `quro worker pension-imports`, a scheduled `quro backup` service or other one-off maintenance services) need `healthcheck: disable: true`; otherwise Docker reports them `unhealthy`, and a tool that restarts unhealthy containers would restart the import worker.
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

#### Statement import profile

What the operator does: only if you run statement import from a checkout. Start it with `docker compose --profile ocr` instead of `--profile pension-import`, and give the model cache to UID 1000 once with `sudo chown -R 1000:1000 data/vllm-cache`. The [example install](install.md) has no statement import, so nothing changes there.

- The import worker, the parser and the model server moved from the `pension-import` profile to `ocr`. A command that still names `--profile pension-import` starts none of them, so statement import stays off until you change it.
- The model server no longer runs as root, so a cache directory that an earlier release filled as root must be handed over with the `chown` above. Its cache moved to `/var/cache/huggingface` inside the container; `./data/vllm-cache` on the host is the same directory. Once the model is cached, `VLLM_HF_HUB_OFFLINE=1` stops the model server from contacting Hugging Face.
- The parser and the model server run as non-root users on an internal Compose network (`ocr-net`, replacing `ai-net`) with memory, CPU and process limits. Only the model server also joins an egress network, to download the model. If an override file refers to `ai-net`, point it at `ocr-net`.
- The parser image starts with `python -m app`. A Compose file that overrides the command with `uvicorn app.main:app` still works, but without the connection limit.
- New optional parser settings bound what one statement may use: `PARSER_MAX_FILE_MB`, `PARSER_MAX_PAGES`, `PARSER_MAX_PAGE_PIXELS`, `PARSER_MAX_TEXT_CHARS`, `PARSER_TIMEOUT_SECONDS`, `PARSER_CPU_SECONDS`, `PARSER_MEMORY_MB`, `PARSER_MAX_CONCURRENCY` and `PARSER_MAX_QUEUE`. Compose also reads `PARSER_CPUS`, `PARSER_MEM_LIMIT`, `VLLM_CPUS` and `VLLM_MEM_LIMIT`. An invalid value stops the parser at startup; the defaults and meanings are in [development](development.md#optional-pension-import-development). Keep `PARSER_TIMEOUT_SECONDS` plus `VLLM_TIMEOUT_SECONDS` below `PENSION_PARSER_TIMEOUT_MS` (in seconds); the defaults (100 and 180 against 300) do.
- A cancelled or failed import deletes its PDF when it ends. Imports that ended before the upgrade keep theirs.

#### Duplicate statement imports

What the operator does: only if `quro migrate` stops with "The same pension statement file was committed more than once to one pot". Nothing else changes.

Migration `0040` adds a unique index on committed statement imports, so a second import of one statement file into one pot cannot be committed and answers `409` from now on. It refuses to run while the database already holds the same statement committed twice to one pot: it changes nothing and lists the import ids per pot. For each group keep one import. For every other import in the group, with 0.8.0 delete the pension transactions it created (`pension_statement_import_rows.committed_transaction_id` lists them), then set that import's status to `cancelled`. Run `quro migrate` again afterwards. The backup you took before the upgrade is your way back.

#### PostgreSQL 18 required

What the operator does: nothing on PostgreSQL 18.

`quro migrate`, `quro doctor`, `quro backup` and `quro restore` refuse any other PostgreSQL major version with exit code 3, before they change anything. `docker compose run --rm migrate doctor` names the server version it found.

#### Settings of releases before 0.8.0

What the operator does: before upgrading, run `docker compose run --rm migrate doctor` with 0.8.0 and remove every setting it reports as no longer read. Nothing else changes for an install that 0.8.0 already accepted.

- 0.9.0 no longer recognises the settings 0.8.0 retired (`DATABASE_HOST`, `DATABASE_PORT`, `APP_DB_USER`, `APP_DB_PASSWORD`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_ADMIN_PASSWORD`, `POSTGRES_APP_PASSWORD`, `MINIO_APP_USER` and `S3_SECRET_ACCESS_KEY` in the backend's environment). They are ignored like any other unknown variable: `quro doctor` and the startup log no longer list them, and a missing replacement is reported without naming the old setting.
- `MINIO_APP_USER` on its own no longer stops every command when `QRO_DOCUMENT_STORAGE` is unset. `S3_ENDPOINT`, `S3_BUCKET` and `S3_ACCESS_KEY_ID` still do.

#### JSON output before 1.0.0

The JSON output of `quro version --json`, `quro migrate --status --json` and `quro doctor --json`, and the readiness report, carry no stability promise before 1.0.0: they may change in any 0.x release, and these notes list each change. See [Interfaces for automation](#interfaces-for-automation). `quro migrate --status` still exits 1 when migrations are pending.

#### API changes

What the operator does: nothing, unless a script or client of your own calls these endpoints. The JSON of the endpoints below may change in any 0.x release (see [JSON output before 1.0.0](#json-output-before-100)).

- `GET /api/dashboard/net-worth` takes an optional `range` (`1m`, `6m`, `1y` or `all`; `6m` when absent) and every point has a `date`. Any other `range` answers `400`. `GET /api/dashboard/summary` returns `yearStart`, the point the year to date change measures from, or `null` without any record. See [household totals](household-model.md#api-contract).
- `GET /api/pensions/imports` answers `400` for an invalid `limit` instead of using 30. Upload routes answer `400` with `Invalid upload` for a body that is not a readable form, where they answered `500`.
- Committing a statement import whose file another import already committed to the same pension pot answers `409`; the second of two concurrent commits does too.
- `jurisdiction.rulesEffectiveFrom` of the runway is `null` when the default tax rate is used.
- `POST /api/bunq/sync`, `/sync/savings` and `/sync/budget` answer `409` with `code: bunq_reauthorization_required` when stored credentials cannot be opened (see [Secrets key for bank links](#secrets-key-for-bank-links)).
- Holding prices (`currentPrice`, `manualPrice`, transaction prices and price history) carry up to six decimals. Money amounts keep two.

### Upgrade from 0.9.0 to 1.0.0-rc.1

Back up with 0.9.0 first (step 1 of the general procedure): [migration 0042 cannot be undone](#migrations-and-the-backup-to-take-first). Then work through the subsections that apply. Every install needs the backup, and an install with a log collector or alert needs [JSON logs and request ids](#json-logs-and-request-ids). A script that calls `quro doctor --json` or the capabilities endpoint needs [doctor checks and the unknown status](#doctor-checks-and-the-unknown-status) or [capabilities and the setup endpoint](#capabilities-and-the-setup-endpoint). The others need no action from most installs: [text field length limits](#text-field-length-limits), [account export and deletion](#account-export-and-deletion), [background job backoff](#background-job-backoff) and [CSV import](#csv-import).

#### Migrations and the backup to take first

What the operator does: take a backup with 0.9.0 before you pull the new images, and keep it until you have checked the upgraded install. Then upgrade as in the general procedure; `quro migrate` applies the three migrations in one transaction.

- `0041_account_deletions` adds the `account_deletions` table, which records account deletions (see [account export and deletion](#account-export-and-deletion)).
- `0042_drop_write_only_bunq_columns` drops `budget_transactions.bunq_mcc`, `bunq_payment_type` and `counterparty_iban`. Bank sync wrote them and nothing read them, but the values are gone once the migration has run: only the backup holds them. Because the database then has migrations that 0.9.0 does not ship, 0.9.0 refuses to run on it; [restore the backup](#restore-the-snapshot-taken-before-the-upgrade) to go back.
- `0043_csv_imports` adds the `import_profiles`, `csv_imports` and `csv_import_rows` tables and the nullable columns `import_id`, `import_source` and `external_id` on `savings_transactions` and `budget_transactions`. No existing value changes.

After the upgrade `quro version --json` reports `1.0.0-rc.1`, `0043_csv_imports` and a count of 44, and `quro migrate --status` exits 0.

#### JSON logs and request ids

What the operator does: if a log collector, parser or alert rule reads the server's or the import worker's log lines, change it to read JSON before you upgrade. Nothing else is needed.

The server and the import worker write one JSON object per line with `time`, `level`, `event` and, during a request, `requestId`. The old bracketed text lines are gone. Every response carries an `X-Request-Id` header, and a reverse proxy may supply its own. Error messages are no longer logged or put into traces: only the error class and its codes. See [Monitor an install](operations.md).

#### Doctor checks and the unknown status

What the operator does: if a script or monitor reads `quro doctor`, accept the new status and the new check ids, and expect exit code 1 where it was 0 before. Run `docker compose run --rm migrate doctor` once after the upgrade and fix what it reports.

New check ids are `jobs.<name>`, `freshness.*`, `disk.*`, `backup.age` and `documents.references`. A check with `status: "unknown"` has no evidence either way, such as a job that has not run since the server started or a backup directory the command cannot read; it does not change the exit code. A stopped core background job, a document that a row refers to but the store lacks, or a nearly full disk fails the run (exit code 1). A backup directory that is not mounted into the container the command runs in reports `backup.age` as `unknown`. See [`quro doctor --json`](#quro-doctor---json) and [Monitor an install](operations.md).

#### Capabilities and the setup endpoint

What the operator does: nothing, unless a script or client of your own calls these endpoints.

- `GET /api/capabilities` no longer has an `ai` key. It duplicated `pensionStatementImport`; read that instead. The result has `pensionStatementImport`, `bunq` and `documents`.
- Each capability has a `lifecycle` field, `stable` or `experimental`. Statement import is `experimental`: it may change or go in a minor release.
- New `GET /api/dashboard/setup` returns `{ "data": { "hasAccount": boolean, "hasTransaction": boolean } }` for the signed-in household (its own rows plus an accepted partner's joint rows). The web app uses it to show the getting started card.

#### Text field length limits

What the operator does: nothing, unless a script or import of your own writes long text through the API.

Create and update requests answer `400` with `<field> must be at most N characters` for text over its limit: names, labels, providers, lenders and locations 100 characters, descriptions and transaction notes 500, debt, pension and goal notes 2000, emails 254 and uploaded document file names 255. A row that already holds a longer value still displays, exports and restores, and an edit is accepted while that field is left unchanged. Bank sync and the importers are not bounded. No migration. The full table is in [text limits](text-limits.md).

#### Account export and deletion

What the operator does: nothing is required. Know that every account can now download its data and delete itself, and that a deletion does not reach your backups.

- `GET /api/settings/export` streams a ZIP of the account's data; `GET` and `DELETE /api/settings/account` preview and perform the deletion, which needs the password and the email address. Both are in **Settings → Your data**. See [data export and deletion](data-export-and-deletion.md).
- If the document store refuses to delete a file, the account is still deleted and the keys stay on the `account_deletions` row. Retry them with `docker compose exec backend quro documents retry-deleted`; it exits 0 when none are pending and 1 when some still fail.
- Backups taken before a deletion still hold the account, and a restore brings it back. Delete those archives if the person must be gone from every copy.

#### CSV import

What the operator does: nothing. The import needs no setting. The tables come with migration `0043` (see [migrations](#migrations-and-the-backup-to-take-first)); [import a CSV](csv-import.md) describes the flow for users.

#### Background job backoff

What the operator does: nothing.

After a failed cycle a background job waits a minute, then two, doubling up to its normal interval, instead of retrying at every poll. `quro doctor` shows a job that keeps failing.

### Upgrade from 1.0.0-rc.1 to 1.0.0-rc.2

1.0.0-rc.2 changes only the frontend's layout on phones. It has no migration, no setting changes and no API changes.

What the operator does: pin the 1.0.0-rc.2 images of both services (step 2 of the general procedure) and restart as usual. A backup before the upgrade is still good practice, and the general procedure takes one, but nothing in this release changes your data.

### Upgrade from 1.0.0-rc.2 to 1.0.0-rc.3

1.0.0-rc.3 adds optional sign-in through an OpenID Connect provider. It has one additive migration (`0044_oidc_sign_in` adds the `oidc_identities` and `oidc_login_attempts` tables), a new set of `OIDC_*` settings that are all unset by default, and new routes under `/api/auth/oidc` that exist only when the settings are present.

What the operator does: nothing, unless you want single sign-on. Pin the 1.0.0-rc.3 images of both services (step 2 of the general procedure) and restart as usual; passwords keep working and no existing account, session or setting changes. Because the database then has a migration that 1.0.0-rc.2 does not ship, 1.0.0-rc.2 refuses to run on it; [restore the snapshot](#restore-the-snapshot-taken-before-the-upgrade) to go back.

To enable it, register Quro at your provider and set the `OIDC_*` settings as described in [Single sign-on](configuration.md#single-sign-on) and [behind the proxy](reverse-proxy.md#single-sign-on-behind-the-proxy). Operators can inspect and remove a link with `quro user oidc status EMAIL` and `quro user oidc unlink EMAIL --yes`, and account holders unlink in **Settings → Security**. Read [how an account is matched](security.md#single-sign-on) first: a person must already have a Quro account, and their first provider sign-in is linked to the account with the same verified email address.

### Upgrade from 1.0.0-rc.3 to 1.0.0-rc.4

1.0.0-rc.4 adds the Exposure tab on the Plan page. It has one additive migration (`0045_exposure_classification` adds the nullable `holdings.asset_class` and `holdings.risk_class_override` columns and the `exposure_settings` table), no new settings and no change to existing routes.

What the operator does: pin the 1.0.0-rc.4 images of both services (step 2 of the general procedure) and restart as usual. Take the backup of the general procedure first: 1.0.0-rc.3 does not ship the migration and refuses to run against a database that has it, so going back after the upgrade means restoring that backup. Existing holdings start unclassified and show as such on the Exposure tab until you classify them.

### Upgrade from 1.0.0-rc.4 to 1.0.0-rc.5

1.0.0-rc.5 adds the setting `QRO_PASSWORD_LOGIN` and the command `quro user create`. It has no migration and changes no existing setting, route, account or session. The default is the behaviour of 1.0.0-rc.4: passwords work.

What the operator does: nothing, unless you want single sign-on to be the only way in. Pin the 1.0.0-rc.5 images of both services (step 2 of the general procedure) and restart as usual. 1.0.0-rc.4 runs on the same database, so going back is a matter of pinning the older images; an account made with `quro user create` has no password and cannot sign in with 1.0.0-rc.4 except through single sign-on.

To turn passwords off, first [configure single sign-on](configuration.md#single-sign-on) and check that every person can sign in with it. Then set `QRO_PASSWORD_LOGIN=false` in `config/quro.env` and recreate the backend with `docker compose up -d backend`. Stored password hashes and existing sessions stay. Read [single sign-on only mode](security.md#single-sign-on-only-mode) and keep [the way back](security.md#recovery-when-the-provider-is-unavailable) at hand: set the value to `true` (or remove it) and recreate the backend. The backend refuses to start with the setting off and no `OIDC_*` settings, so a mistake in the file shows up as exit code 2 at once; `quro doctor` reports the mode and warns when the provider cannot be reached.

### Upgrade from 1.0.0-rc.5 to 1.0.0-rc.6

1.0.0-rc.6 separates the property and mortgage ledgers. A property keeps what happens to the asset (valuations, rent income and expenses) and a mortgage what happens to the loan (repayments and rate changes). A property's only debt is its linked mortgage, its value is its latest valuation, and its equity is worked out from the two on every read. Migration `0046_property_mortgage_ledger_ownership` moves existing rows to the ledger that owns them and drops the columns that let each ledger hold the other's rows. It changes no balance: a repayment already reduced the mortgage it paid.

What the operator does: take the backup of the general procedure first and keep it until you have checked the upgraded install. The migration drops `properties.mortgage`, the property repayment columns and `mortgages.property_value` and `property_address`; only the backup holds them afterwards, and 1.0.0-rc.5 refuses to run against the migrated database, so going back means [restoring that backup](#restore-the-snapshot-taken-before-the-upgrade). Before you upgrade, with 1.0.0-rc.5 still running, open the database (with the bundled one, `docker compose exec db psql -U quro_admin -d quro`) and run this read-only count:

```sql
SELECT
  (SELECT count(*) FROM property_transactions WHERE type = 'repayment') AS property_repayments,
  (SELECT count(*) FROM property_transactions WHERE type = 'repayment' AND repayment_target IS DISTINCT FROM 'mortgage') AS property_repayments_own_debt,
  (SELECT count(*) FROM mortgage_transactions WHERE type = 'valuation') AS mortgage_valuations,
  (SELECT count(*) FROM properties WHERE mortgage_id IS NULL AND mortgage <> 0) AS manual_debts;
```

`property_repayments` and `mortgage_valuations` are rows the migration moves. If `property_repayments_own_debt` or `manual_debts` is not 0, the migration will refuse; resolve those rows first, as below.

#### What the migration does

- A property repayment recorded against a mortgage moves to that mortgage's ledger with its amount, interest, principal, the principal a zero balance absorbed, date, note and the person who entered it.
- A mortgage valuation moves to the ledger of the property the mortgage is linked to.
- A property with valuations takes its latest valuation dated on or before the day of the upgrade (UTC, ties by id) as its current value; a property without one keeps its value. A valuation dated later takes effect on its date: the daily net worth snapshot job applies it.
- The migration runs in one transaction and changes nothing when it refuses. Run again after a refusal, it starts over; run on a database it already migrated, it changes nothing.

#### When the migration refuses

`quro migrate` stops with `Property and mortgage ledgers cannot be separated:` followed by one entry for each problem it found, naming row ids only, and `Nothing was changed.` The install keeps running 1.0.0-rc.5's schema, so pin the 1.0.0-rc.5 images again, resolve each entry in the app, and upgrade again.

- **Property repayments `…` paid a debt kept on the property or no recorded mortgage.** The repayment was recorded against a balance typed on the property, before 0.9.0 recorded which debt a repayment paid, or against a mortgage that was deleted since. Quro cannot tell which mortgage it belongs to. On the Investments page, delete it from the property's transactions, and record it on the Mortgage page if it paid the property's mortgage.
- **Mortgage valuations `…` belong to a mortgage that is not linked to exactly one property.** The mortgage is unlinked, usually because its property was linked to a new mortgage after this one was archived, so Quro cannot tell which property was valued. A valuation recorded on a mortgage never changed any figure. If the mortgage can be linked to its property again, link it and upgrade; the valuation then moves to that property. Otherwise record each valuation you want to keep on the property (Investments page, transaction type Valuation), then remove the mortgage's valuations with `docker compose exec db psql -U quro_admin -d quro -c "DELETE FROM mortgage_transactions WHERE type = 'valuation' AND id IN (…)"`, listing the ids the migration named.
- **Properties `…` carry a mortgage balance without a linked mortgage.** The property has a debt typed on it and no mortgage. Add the mortgage on the Mortgage page and link it to the property (its repayments then go there), or set the property's mortgage balance to 0 if it has no debt.

#### API changes

What the operator does: nothing, unless a script or client of your own calls these endpoints.

- `POST` and `PATCH /api/investments/property-transactions` accept the types `valuation`, `rent_income` and `expense` and no longer accept `interest` or `principal`; `repayment` and `rate_change` answer `400`. `POST` and `PATCH /api/mortgages/transactions` accept `repayment` and `rate_change`; `valuation`, `rent_income` and `expense` answer `400`.
- Property requests no longer accept `mortgage`, and responses carry `debt`, `totalEquity` and `equity` (see [property debt](household-model.md#property-debt)) instead of `mortgage`. Property transaction responses no longer carry `interest`, `principal`, `unappliedPrincipal`, `repaymentTarget` or `repaymentMortgageId`.
- Mortgage requests no longer accept `propertyAddress` or `propertyValue`; responses read `linkedPropertyId`, `propertyAddress` and `propertyValue` from the linked property, and they are `null` for a mortgage without one.
- A property valuation sets the property's `currentValue` from its date: at once when it is dated on or before today (UTC), otherwise when the daily net worth snapshot job runs on or after that date. While a valuation sets the value, a `PATCH` that sets a different `currentValue` answers `400`.
