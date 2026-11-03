# Upgrade Quro

This guide is for operators who run Quro and move it to a newer release. Quro never updates itself: you pick the version, back up, migrate and restart, by hand or from your own CI/CD. Upgrades are supported from the last 1.0.0 release candidate on, on PostgreSQL 18. Each release's own notes follow the generic steps, under [Upgrade notes](#upgrade-notes).

The commands assume an install made with [the install guide](install.md): they run in the directory that holds `compose.yaml` and `config/`, and use its `migrate` service for operator commands.

## How upgrades work

- **Two images per release.** `ghcr.io/pieter-ohearn/quro-backend` (the server, the optional import worker and every `quro` command) and `ghcr.io/pieter-ohearn/quro-frontend`. Use both at the same version. Pulling them needs no registry account.
- **Pin the version and the digest.** A tag can be moved; a digest cannot. Each release's notes list the digest of both images. Pin both in `compose.yaml`, for example `image: ghcr.io/pieter-ohearn/quro-backend:v1.0.0-rc.1@sha256:<digest from the release notes>`, and the same tag and digest for the `migrate` service. Docker then refuses an image whose digest does not match.
- **Migrations only move forward.** `quro migrate` applies a release's schema migrations, all in one transaction, under a lock. The server never migrates by itself. An image refuses to run against a schema it does not know: readiness stays `503` and `quro migrate` stops with exit code 3. So going back to an older image works only while it ships every migration the database has (see [Roll back or restore](#roll-back-or-restore)).
- **Readiness tells you when to route traffic.** `GET /api/health` answers `200` while the process runs. `GET /api/readiness` answers `200` only when the database answers, the schema matches the image and the document store is usable. The image's health check, `quro health`, uses readiness, so `docker compose ps` shows the backend as `healthy` only then.

## Upgrade to a new release

Read the release notes and upgrade notes of every version between yours and the target first: they say what changes and whether you have to change settings.

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

These outputs are meant for scripts and monitoring. The JSON output of `quro version --json`, `quro migrate --status --json` and `quro doctor --json`, and the readiness report, are stable from 1.0.0; each release's [upgrade notes](#upgrade-notes) list any change. `quro migrate --status` keeps exit code 1 for pending migrations. Text output without `--json` is for people and may change.

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
  "version": "v1.0.0-rc.6",
  "revision": "<commit the image was built from>",
  "migrations": { "latest": "0046_property_mortgage_ledger_ownership", "count": 47 },
  "runtime": { "bun": "1.4.4", "platform": "linux", "arch": "arm64" }
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

### Upgrade from 1.0.0-rc.6 to the next release

The next release stores a dividend's amount in its own money column. Until now a dividend kept the amount it paid in `holding_transactions.price`, the six-decimal column for a price per share. Migration `0047_holding_dividend_amount` adds `holding_transactions.amount` (`numeric(19,2)`), moves each dividend's amount there, leaves the dividend's `price` empty, and adds a check that a dividend has an amount and no price and that any other row has a price and no amount. No balance or total changes: dividends were already rounded to cents.

What the operator does: take the backup of the general procedure first. 1.0.0-rc.6 refuses to run against the migrated database (`Status: ahead.`), so going back means [restoring that backup](#restore-the-snapshot-taken-before-the-upgrade). Before you upgrade, with 1.0.0-rc.6 still running, open the database (with the bundled one, `docker compose exec db psql -U quro_admin -d quro`) and run this read-only count:

```sql
SELECT
  count(*) FILTER (WHERE type = 'dividend') AS dividends,
  count(*) FILTER (WHERE type = 'dividend' AND price <> round(price, 2)) AS dividends_not_whole_cents
FROM holding_transactions;
```

`dividends` is the number of rows the migration moves. If `dividends_not_whole_cents` is not 0, the migration will refuse, as below.

#### Bank-link secrets and backup tools

The next release also drops the tools and code paths that only releases before 1.0.0 needed.

What the operator does: before you upgrade, with 1.0.0-rc.6 still running, check that every stored bank-link secret is encrypted:

```bash
docker compose run --rm migrate secrets status
```

Exit code 0 means there is nothing to do. If it reports unencrypted secrets, run `docker compose run --rm migrate secrets encrypt` with 1.0.0-rc.6 while the backend is stopped, and check the status again. Then upgrade as in the general procedure.

- **Unencrypted bank-link secrets are refused.** The next release reads only bank-link secrets encrypted with the secrets key. An unencrypted one is never read or encrypted: a sync answers `409` with `code: bunq_reauthorization_required`, Settings asks the user to connect bunq again, and `quro secrets status` and `quro doctor` name the users. The `quro secrets encrypt` command is gone; `quro secrets rotate` moves secrets from the previous key to the current one only.
- **Only `quro backup` and `quro restore` back up and restore.** The `db-tools` service of the repository's `docker-compose.yml`, the `db:backup`, `db:restore` and `db:clear` scripts, the `QRO_CLEAR_CONFIRM` and `QRO_CLEAR_ALLOW_NON_EMPTY` settings and the image's `/app/backups` link are gone. Quro no longer restores a bare `.dump` file. An archive that holds unencrypted bank-link secrets is not supported: it restores, but those bank links must be connected again. In a checkout, run the backup commands through the `migrate` service, which now mounts `./backups` and `./data/documents` (see [backup and restore](backup-and-restore.md#compose-stack-of-this-repository)).

#### When the migration refuses

`quro migrate` stops with `Dividend amounts cannot move to their own column: holding transactions … are dividends of an amount that is not whole cents`, naming row ids only, and `Nothing was changed.` Such an amount can only come from an install that stored dividends before they were rounded on input. Pin the 1.0.0-rc.6 images again, open each named dividend on the Investments page, save its amount (the form rounds it to cents), and upgrade again.

#### Figures that move

What the operator does: nothing. These are corrections a user may notice after the upgrade.

- A holding with a price entered by hand is valued at that price on the dashboard, in net worth, in the current snapshot and in the latest point of the net worth history and the portfolio chart, as it already was on its Investments row and in Exposure. The brokerage total on the Investments page is now the sum of its rows.
- A budget category's spent amount is no longer floored at zero when a transaction is deleted or a bunq payment is revalued, so it stays the amount entered plus its transactions. A category whose spent amount was set by hand below its transactions can show a negative spent amount after a delete.
- Salary growth compares full years: a year with fewer than twelve months of payslips is annualised from those months, and the chart says which years were.

#### API changes

What the operator does: nothing, unless a script or client of your own calls these endpoints.

- `POST` and `PATCH /api/investments/holding-transactions` take a dividend's amount in `amount`; a dividend with a `price`, or a buy or sell with an `amount`, answers `400`. Responses carry `amount` (a number for a dividend, `null` otherwise), and a dividend's `price` is `null`. Changing a buy or sell into a dividend needs an `amount`, and a dividend into a buy or sell a `price`; the other one is not carried over.
- Creating or renaming a budget category onto the name of another category in the same month answers `409` instead of `500`.
- The bunq callback (`GET /api/bunq/oauth/callback`) holds the maintenance lock like a write request. While `quro backup` or `quro restore` runs it changes nothing and redirects to `/settings?bunq=paused`; start the connection again afterwards.
