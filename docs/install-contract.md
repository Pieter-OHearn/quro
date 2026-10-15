# Install contract

This page records how Quro is installed from release images and what each piece promises. It is written for operators who run Quro and for contributors who build the installer. It is a decision record plus a service contract: it fixes names, paths, commands and behaviour, and lists where 0.7.0 differs.

The contract applies from 0.8.0, the first release installed this way; the rows marked **0.7.0** below describe that release. The step-by-step install with these commands is in [Install Quro](install.md), the README's [quickstart](../README.md#quickstart) is its short form, and every setting is listed in the [configuration reference](configuration.md).

## Status

Accepted on 2026-10-09. Reviewed against `main` at `e92dd51` (after 0.7.0). Changing a decision here needs a new dated entry in [Decision log](#decision-log); implementation changes that only fill in details do not.

## Decisions

### Installer form: subcommands in the backend image

The backend image is the installer. Every install and maintenance task is a subcommand of one entry point, `quro`, that ships in `ghcr.io/pieter-ohearn/quro-backend`:

```text
docker run --rm [mounts and settings] ghcr.io/pieter-ohearn/quro-backend:<version> <command> [options]
```

Reasons:

- The commands always match the application and schema version, because they ship in the same image.
- Operators need nothing besides Docker to install, upgrade, back up or restore. There is no script to download and nothing is piped into a privileged shell.
- The commands work the same under Docker Compose, `docker run`, systemd units, Kubernetes jobs or an operator's CI, because they take endpoints and paths from settings, not from a Compose file.

Alternatives considered:

| Option                                    | Why not                                                                                                                                                                           |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Host shell installer (`curl … \| sh`)     | Runs remote code with the operator's privileges, has to support every host OS, and drifts from the image it installs.                                                             |
| Generated Compose file as a release asset | That is the 0.6.x and 0.7.0 approach. It ties the install to one orchestrator and one file name, and template rendering already broke the published file's database health check. |
| Separate installer image                  | A second image to pull, publish and keep in step with the backend version.                                                                                                        |

### A reference Compose example in the docs, not a release asset

The project publishes one Docker Compose file, `docs/compose.example.yaml`, as an example that operators copy and own. CI starts it from empty volumes on every change, so it stays correct. It is a plain file: no placeholders and no template step.

Releases no longer attach `docker-compose.release.yml` or the auto-update bundle. The template they were rendered from is removed together with the auto-updater.

### Operators own orchestration

Quro never starts, stops, pulls or updates containers. It needs no access to the Docker socket and it does not update itself. Upgrades are an operator action: change the pinned version, run `quro backup` and `quro migrate`, restart.

### Endpoints come from settings, never from service names

Every command reads the database host, document store and backend address from settings. No setting defaults to a Compose service name: `POSTGRES_HOST`, `S3_ENDPOINT` (with S3) and the frontend's `QRO_API_URL` are required, and a missing one stops the command with exit code 2.

### Old settings are not carried forward

Aliases and defaults that only existed for 0.7.0 and earlier installs are not kept, and their names are not recognised: they are ignored like any other unknown variable. A configuration that depended on them is missing a required setting and fails at startup with exit code 2, instead of being guessed at.

### Documents are stored on the filesystem by default

New installs keep uploaded documents in a directory. S3-compatible storage stays available as an option for operators who already run object storage. Existing installs that use S3 must say so with `QRO_DOCUMENT_STORAGE=s3` and can keep S3 until they move the objects. The reasoning is in [Document storage evaluation](#document-storage-evaluation).

### The backend runs as an unprivileged user

The backend image runs as UID 1000, GID 1000, works with any other UID passed through `--user` (no passwd entry is needed), and needs no writable path outside its data directories and `/tmp`. Operators make the host files it uses accessible to that UID.

The frontend image runs nginx as its unprivileged `nginx` user (UID 101), also works with any `--user`, and writes only below `/tmp`. Both images run with a read-only root filesystem; [container hardening](security.md#container-hardening) lists the restrictions the example Compose file applies.

### Statement OCR stays opt-in

The pension statement parser and its model server stay behind the `ocr` Compose profile of the checkout's `docker-compose.yml` and are experimental. The default install, the example Compose file and the core readiness check do not reference them.

## Images

| Image                                     | Role                                                                 | Platforms                    |
| ----------------------------------------- | -------------------------------------------------------------------- | ---------------------------- |
| `ghcr.io/pieter-ohearn/quro-backend`      | API server, optional pension import worker, and every `quro` command | `linux/amd64`, `linux/arm64` |
| `ghcr.io/pieter-ohearn/quro-frontend`     | nginx: serves the web app and proxies `/api` to the backend          | `linux/amd64`, `linux/arm64` |
| `postgres:18` (official image)            | Database. PostgreSQL 18 is the only supported major                  | Both                         |
| Any S3-compatible service                 | Optional document store. The project does not pin or ship one        | Operator's choice            |
| `ghcr.io/pieter-ohearn/quro-auto-updater` | Retired. Existing tags stay published; no new releases               | –                            |

Pin images by version tag and record the digest. The core images must pull without a registry account, and a check in CI and in the release workflow keeps that true: [Distribution](distribution.md) records the anonymous manifest, layer and runtime evidence for both platforms of the 0.7.0 images and explains why package visibility is per package, not per tag. The updater is not a release requirement. The pension parser and model server images are not published; the OCR profile builds them from a checkout.

## Commands

The image's entry point is `quro`; its default command is `serve`.

| Command                          | What it does                                                                                                                                                                                                                                                                                                                     | Changes                            | Secrets it reads                       |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- | -------------------------------------- |
| `quro serve`                     | Runs the API server. Does not migrate.                                                                                                                                                                                                                                                                                           | Application data                   | Runtime database, storage              |
| `quro worker pension-imports`    | Runs the optional pension import worker.                                                                                                                                                                                                                                                                                         | Application data                   | Runtime database, storage              |
| `quro init [--dir <path>]`       | Writes a settings file and generated secret files (database passwords and the secrets key) into a mounted directory (default `/config`). Creates only missing files; never changes an existing one. `--dry-run` lists what it would create.                                                                                      | New files only                     | None                                   |
| `quro migrate [--dry-run]`       | Applies pending schema migrations as the owner role, then creates or updates the runtime role and its grants. `quro migrate --status [--json]` compares the database with the image and changes nothing.                                                                                                                         | Schema, runtime role               | Admin and runtime database             |
| `quro doctor [--json]`           | Read-only checks: settings, database reachability for both roles, schema against the image, backup tool version, document store access.                                                                                                                                                                                          | Nothing                            | All configured                         |
| `quro backup [--output <dir>]`   | Writes one archive: database dump, documents (filesystem) or an object manifest (S3), and a manifest with versions and checksums. Changes are paused while it copies. `--label` and `--wait` as in [Backup and restore](backup-and-restore.md#back-up); `quro backup verify <archive>` checks an archive.                        | A new file in the backup directory | Admin database, backup key             |
| `quro restore <archive>`         | Restores an archive into the configured database and document store, behind the confirmation guards in [Backup and restore](backup-and-restore.md).                                                                                                                                                                              | Database, documents                | Admin and runtime database, backup key |
| `quro user <command>`            | Account administration: registration invite codes, password reset codes, session revocation. Shows account metadata only, never financial data.                                                                                                                                                                                  | Accounts and sessions              | Runtime database                       |
| `quro documents migrate-from-s3` | Copies every referenced object from S3 into the filesystem store under the same key and verifies checksums. Resumable. Changes no database rows and never deletes from S3; the operator then sets `QRO_DOCUMENT_STORAGE=filesystem`.                                                                                             | Documents directory                | Runtime database, storage              |
| `quro secrets <command>`         | `status`: counts the stored bank-link secrets by state and key id, prints no value, changes nothing. `encrypt`: encrypts unencrypted ones with the secrets key. `rotate`: re-encrypts those sealed with the previous key. One connection per transaction, resumable; see [integration secrets](security.md#integration-secrets). | Bank-link secrets                  | Runtime database, secrets keys         |
| `quro health`                    | Exits 0 when the local server reports ready. For container health checks.                                                                                                                                                                                                                                                        | Nothing                            | None                                   |
| `quro version [--json]`          | Prints the application version, the newest bundled migration and the image revision.                                                                                                                                                                                                                                             | Nothing                            | None                                   |

Rules for every command:

- It is non-interactive and safe to run again. A second `quro migrate` or `quro init` changes nothing.
- It prints each change it makes, and never prints a secret value or a connection string with its password.
- Secret values reach child processes through files or environment variables, never as command-line arguments.
- `--dry-run`, where offered, reports the plan and changes nothing.

Exit codes:

| Code | Meaning                                                                                                                                                                       | What automation should do |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| 0    | Done, or nothing to do                                                                                                                                                        | Continue                  |
| 1    | The operation failed                                                                                                                                                          | Stop; read the output     |
| 2    | Usage or settings are invalid. Nothing was changed                                                                                                                            | Fix the settings          |
| 3    | A safety guard refused: missing confirmation, non-empty restore target, schema newer than the image, missing database privileges, unsupported PostgreSQL. Nothing was changed | Needs a person            |
| 4    | The database or document store is unreachable                                                                                                                                 | Retry later               |

The JSON output of `quro version --json`, `quro migrate --status --json` and `quro doctor --json`, and the readiness report, may change in any 0.x release; the upgrade notes list each change. They are stable from 1.0.0. `quro migrate --status` exits 1 while migrations are pending. [Interfaces for automation](upgrade.md#interfaces-for-automation) describes the fields.

## Ports

| Container | Port     | Exposure                                                                                                          |
| --------- | -------- | ----------------------------------------------------------------------------------------------------------------- |
| Frontend  | 80/tcp   | The only published port. The operator maps it (the example uses host port 3000) or puts a reverse proxy in front. |
| Backend   | 3000/tcp | Internal. Set by `PORT`; binds to `HOST` (default `0.0.0.0`). Reached by the frontend only.                       |
| Database  | 5432/tcp | Internal.                                                                                                         |

Changing a published port is a breaking change and is called out in the upgrade notes.

## Settings

Settings are environment variables, usually kept in one file passed with `env_file`. Secrets are files. Two naming rules apply: settings that stay keep their current names, and new Quro-specific settings start with `QRO_`. Settings that describe a dependency keep that dependency's prefix (`POSTGRES_`, `S3_`, `BUNQ_`, `OTEL_`).

### Database

| Setting                        | Default                                | Notes                                                                         |
| ------------------------------ | -------------------------------------- | ----------------------------------------------------------------------------- |
| `POSTGRES_HOST`                | none, required                         | Exit code 2 when unset. **0.7.0:** the image ignores it and always uses `db`. |
| `POSTGRES_PORT`                | `5432`                                 | **0.7.0:** always 5432 in the image.                                          |
| `POSTGRES_DB`                  | `quro`                                 |                                                                               |
| `POSTGRES_ADMIN_USER`          | `quro_admin`                           | Owner role: runs migrations, backup and restore.                              |
| `POSTGRES_APP_USER`            | `quro_app`                             | Runtime role: data access only, no DDL.                                       |
| `POSTGRES_ADMIN_PASSWORD_FILE` | `/run/secrets/postgres_admin_password` | Read only by `migrate`, `backup`, `restore` and `doctor`.                     |
| `POSTGRES_APP_PASSWORD_FILE`   | `/run/secrets/postgres_app_password`   |                                                                               |
| `POSTGRES_SSLMODE`             | unset                                  | New. Passed to the client as `sslmode` for an external database.              |

Older names for these settings are not read. `DATABASE_URL`, `ADMIN_DATABASE_URL` and `APP_DATABASE_URL` remain a development and test interface. They carry passwords in the environment and are not part of the operator contract.

### Document storage

| Setting                     | Default                             | Notes                                                                                                                                                                                                                                 |
| --------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `QRO_DOCUMENT_STORAGE`      | `filesystem`                        | New. `filesystem` or `s3`. When it is unset but an S3 setting (`S3_ENDPOINT`, `S3_BUCKET` or `S3_ACCESS_KEY_ID`) is present, every command stops with exit code 2 instead of guessing. `quro init` and the example set it explicitly. |
| `QRO_DOCUMENTS_DIR`         | `/var/lib/quro/documents`           | New. The filesystem driver, and where `quro documents migrate-from-s3` copies to. Absolute path.                                                                                                                                      |
| `S3_ENDPOINT`               | none                                | Required by the S3 driver. **0.7.0:** defaults to `http://minio:9000`.                                                                                                                                                                |
| `S3_REGION`                 | none                                | Required by the S3 driver. **0.7.0:** the Compose files set `eu-west-1`.                                                                                                                                                              |
| `S3_BUCKET`                 | none                                | Created by the operator.                                                                                                                                                                                                              |
| `S3_FORCE_PATH_STYLE`       | `true`                              |                                                                                                                                                                                                                                       |
| `S3_ACCESS_KEY_ID`          | none                                | Required by the S3 driver. **0.7.0:** taken from `MINIO_APP_USER`, which is not read.                                                                                                                                                 |
| `S3_SECRET_ACCESS_KEY_FILE` | `/run/secrets/s3_secret_access_key` | New. **0.7.0:** the entry point reads `/run/secrets/minio_app_secret_key`.                                                                                                                                                            |

### Backups

| Setting                          | Default                 | Notes                                                                                                                        |
| -------------------------------- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `QRO_BACKUP_DIR`                 | `/var/lib/quro/backups` | New. Must exist; Quro does not create it. **0.7.0:** `/app/backups/db` inside the image.                                     |
| `QRO_BACKUP_ENCRYPTION_KEY_FILE` | unset                   | New. A secret file of at least 32 characters; archives are then encrypted. Never in an archive.                              |
| `QRO_BACKUP_OFFSITE_DIR`         | unset                   | New. A directory on another device that receives a checked copy of every archive. Needs the encryption key.                  |
| `QRO_BACKUP_KEEP`                | unset (keep all)        | New. Unlabelled archives kept per directory, counting the new one; older ones are deleted only after the new one is checked. |
| `QRO_RESTORE_CONFIRM`            | unset                   | Must be `restore-db` for `quro restore`. Unchanged.                                                                          |
| `QRO_RESTORE_ALLOW_NON_EMPTY`    | unset                   | `1` allows restoring over data. Unchanged.                                                                                   |

### Web and frontend

| Setting                                                               | Container | Notes                                                                                                                                                                                                                                                                 |
| --------------------------------------------------------------------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PORT`, `HOST`                                                        | Backend   | Listen address. Defaults `3000` and `0.0.0.0`.                                                                                                                                                                                                                        |
| `SECURE_COOKIES`, `TRUSTED_PROXIES`, `CORS_ORIGIN`, `FRONTEND_ORIGIN` | Backend   | Deployment mode settings; see [Security model](security.md).                                                                                                                                                                                                          |
| `QRO_API_URL`                                                         | Frontend  | Required. Backend address for the `/api` proxy, for example `http://backend:3000`; the frontend stops at startup when it is unset. **0.7.0:** fixed to `backend:3000` in `packages/frontend/nginx.conf`; nginx stops at startup when no host called `backend` exists. |

Optional features (bunq, tracing, statement OCR) keep their current settings, listed in `.env.example`. Each is off when its settings are absent; partial bunq settings stop startup with a redacted error.

### Integration secrets

| Setting                         | Default                    | Notes                                                                                                                                                                                                               |
| ------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `QRO_SECRETS_KEY_FILE`          | `/run/secrets/secrets_key` | New in 0.9.0. 64 hexadecimal characters, written by `quro init`. Encrypts the stored bank-link secrets. Required once bunq is configured; an invalid file stops every command with exit code 2. Never in an archive |
| `QRO_SECRETS_PREVIOUS_KEY_FILE` | unset                      | New in 0.9.0. Only while rotating the secrets key with `quro secrets rotate`                                                                                                                                        |

### Secret files

- One value per file. A trailing newline is ignored; an empty file is an error.
- Mounted read-only, by default under `/run/secrets/`. Values are never baked into images, settings files or command lines.
- `quro init` generates 24 random bytes per password, written as 48 hexadecimal characters, and 32 random bytes for the secrets key, written as 64, in files with mode `0600` inside a `0700` directory.
- The process that reads a file must be able to open it. Docker Compose does not apply `uid`, `gid` or `mode` to secrets whose source is a file: the container sees the host file's owner and mode. See [File ownership](#file-ownership).
- Not covered by `quro backup`. Keep a copy of the settings file and the secrets directory with your backups, separately protected.

## Dependencies

### PostgreSQL

PostgreSQL 18 is the only supported server. `quro migrate`, `quro doctor`, `quro backup` and `quro restore` refuse any other major with exit code 3, before anything is written or locked. Backup and restore also need client tools of the same or a newer major version than the server, so the backend image ships PostgreSQL 18 client tools.

Two roles:

| Role                          | Needs                                                                                                                                                                                    |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Owner (`POSTGRES_ADMIN_USER`) | Owns the database, so it can create the `drizzle` schema and the application tables. Superuser is not needed. To let `quro migrate` create the runtime role, it also needs `CREATEROLE`. |
| Runtime (`POSTGRES_APP_USER`) | `LOGIN`. Gets `SELECT`, `INSERT`, `UPDATE`, `DELETE` on tables and `USAGE`, `SELECT` on sequences from `quro migrate`. No DDL.                                                           |

On a database you provide yourself:

- **Owner with `CREATEROLE`:** `quro migrate` creates the runtime role and sets its password from the secret file.
- **Owner without `CREATEROLE`:** create the runtime role yourself with the password in the secret file. `quro migrate` then only applies grants and checks that the runtime password signs in. **0.7.0:** it tries to change that role's password and fails.
- **Neither:** `quro migrate` checks this before migrating, stops with exit code 3 and says which of the two to do.

`quro migrate` takes a database lock, so two runs at the same time are serialised. **0.7.0:** a second concurrent run fails part way.

### Document store

- **Filesystem:** a directory mounted at `QRO_DOCUMENTS_DIR`, writable by the backend UID. The pension import worker, when used, mounts the same directory. Object keys keep their current form (`users/<id>/…/<uuid>.pdf`) and become paths relative to the directory.
- **S3:** a bucket and an access key that can get, put, delete and list objects in it. The operator creates both with their provider's tools. Quro does not administer the S3 server and ships no bootstrap job for it.

### Outbound network

Installing needs the registries the images come from, and no account at either. Once running, the core makes one kind of outbound call without being configured: the scheduled price and exchange-rate refreshes to Yahoo Finance, which have no separate switch. Bank linking calls bunq, S3 storage calls its endpoint, and tracing exports to the configured endpoint, each only when set. [Distribution](distribution.md#service-feature-hardware-and-egress-matrix) lists every call per feature, with the hardware and accounts each feature needs.

## Persistent data

| Data                      | Location in the container                         | Owner                                 | In `quro backup`                    |
| ------------------------- | ------------------------------------------------- | ------------------------------------- | ----------------------------------- |
| PostgreSQL cluster        | `/var/lib/postgresql`                             | Database image user                   | As a logical dump                   |
| Documents (filesystem)    | `/var/lib/quro/documents`                         | Backend UID                           | Yes                                 |
| Documents (S3)            | The operator's bucket                             | Operator                              | As a manifest of keys and checksums |
| Backups                   | `/var/lib/quro/backups`                           | Backend UID                           | –                                   |
| Off-device copies         | `QRO_BACKUP_OFFSITE_DIR`, mounted by the operator | Backend UID                           | –                                   |
| Settings file and secrets | On the host, chosen by the operator               | Operator; readable by the backend UID | No; keep a protected copy           |

Never point a PostgreSQL container at a data directory written by another major. A major version change is a dump and restore into a new directory (see [Upgrade](#upgrade)).

### File ownership

Linux enforces ownership on bind mounts, so on a Linux host:

- A new **named volume** needs no preparation. The image creates its data directories owned by UID 1000, and Docker copies that ownership into an empty named volume the first time it is mounted.
- A **bind-mounted directory** must be writable by the backend UID, and **secret files** readable by it. Either run the backend and `quro init` with your own UID (`--user "$(id -u):$(id -g)"`, or `user:` in Compose), or give the files to UID 1000 (`chown 1000:1000`).
- With a custom UID, use bind mounts you own: a named volume would still be initialised for UID 1000.

Docker Desktop on macOS did not enforce these permissions on bind mounts in testing, so a setup that works there can still fail on Linux.

## Order of operations and readiness

1. Start PostgreSQL, and the S3 service if you use one. The database health check uses literal values, for example `pg_isready -U quro_admin -d quro`.
2. Run `quro migrate` once, as a job that exits. In Compose, the server and worker depend on it with `condition: service_completed_successfully`.
3. Start `quro serve` (and the worker, if used).
4. Start the frontend.

Readiness:

| Endpoint             | Meaning                                                                                                                                                                                                    |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/health`    | Liveness. 200 while the process runs. Checks no dependencies.                                                                                                                                              |
| `GET /api/readiness` | 200 when the database answers, the schema matches the image, and the configured document store is usable; otherwise 503 with a JSON report. **0.7.0:** always requires S3 and does not compare the schema. |

The backend container's health check is `quro health`. The server never migrates on start. When the schema is behind the image, readiness reports it and the fix is `quro migrate`. When the schema is ahead of the image (after a rollback), readiness reports it and the fix is the newer image or a pre-upgrade backup.

## Backup and restore

`quro backup` and `quro restore` replace the backup and restore commands of the `db-tools` Compose service. They read the same settings as every other command, so they work without Compose and without a service named `db`. The procedure, the measured recovery times and their limits are in [Backup and restore](backup-and-restore.md).

- A backup is one archive in `QRO_BACKUP_DIR`: a custom-format database dump, the documents directory (filesystem) or an object manifest (S3), and a manifest with the application version and image revision, the last applied migration, the SHA-256 of every entry, a row count and checksum of every table, what the archive leaves out (settings, secret files, the backup and secrets keys), and the key id of every secrets key the dump's bank-link secrets are encrypted with. The archive is written under a temporary name, read back and checked, and renamed when complete. **0.7.0:** a failed dump leaves an empty file with the final name.
- While the dump and the documents are copied, maintenance mode holds a database advisory lock: the server answers changes with 503 and background jobs skip their turn; running changes finish first. The lock ends with the command's connection, so a killed backup cannot leave the instance paused. The server finishes open requests on `SIGTERM` before it exits.
- Optional: archives encrypted with a key file (AES-256-GCM, scrypt), a checked copy in an off-device directory, and retention that deletes older unlabelled archives only after the new one and its copy are checked.
- A backup refuses a server other than PostgreSQL 18 and a database migrated by a newer release (exit code 3), and refuses to run with client tools older than the server, all before it pauses changes or writes anything.
- A restore refuses a server other than PostgreSQL 18 (exit code 3) before it reads the archive, and keeps the current guards: explicit confirmation, a refusal to overwrite a non-empty database or documents directory unless allowed, a refusal while other sessions are connected, and an automatic pre-restore archive. It reads the whole archive and checks every checksum before it changes anything, refuses an archive from a newer application version or with a migration the image does not bundle, and compares every table and document with the manifest afterwards.
- A restore needs a database that is new and empty, or at the archive's migration. On a new machine with an image of the archive's version, `quro migrate` may run before or after `quro restore`; with a newer image, run `quro restore` into the empty database first, then `quro migrate`.
- Bare dumps (`.dump`) from earlier releases are restored with the image's `db:restore` script, not with `quro restore` (see [Restore a database dump](backup-and-restore.md#restore-a-database-dump)).

## Scenarios

### Fresh install

Prerequisites, which count toward install time:

| Prerequisite                                        | Notes                                                                                                                                                                             |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A host with Docker Engine and the Compose v2 plugin | amd64 or arm64. Docker itself is not timed below. The measurements used Engine 29.5.3 with Compose v5.1.4, and Engine 29.8.1 with Compose v5.5.1 for the Linux permission checks. |
| Network access to Docker Hub and `ghcr.io`          | About 1.7 GB of disk for images in a clean engine (measured below). No registry account.                                                                                          |
| About 2 GB of disk and 512 MB of free memory        | Idle use measured below; add room for data and backups.                                                                                                                           |
| Not needed                                          | A GPU, a model, a bank account, an email server, an object store, a registry account.                                                                                             |
| Optional                                            | A reverse proxy for HTTPS, an S3-compatible store, a GPU for statement OCR.                                                                                                       |

Steps: create a directory, copy the example Compose file, run `quro init`, review the settings file, `docker compose up -d`, open the app and create the first owner account.

### Existing PostgreSQL

Point `POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_DB` and the two roles at your server and leave the database service out. See [PostgreSQL](#postgresql) for the role privileges. Use `POSTGRES_SSLMODE` for a server outside the host.

### Existing S3-compatible store

Set `QRO_DOCUMENT_STORAGE=s3` and the `S3_` settings. Create the bucket and the access key first; `quro doctor` checks that the bucket can be reached with that key (a read-only `HeadBucket` request). It never writes, reads or deletes an object.

### Upgrade

These steps apply from 0.8.0 on; [Upgrade Quro](upgrade.md) has the commands, rollback and restore. Upgrading from a release before 0.8.0 is not supported by this release.

1. Read the upgrade notes for every version you skip.
2. Run `quro backup` with the old image.
3. Change the pinned version and pull.
4. Run `quro migrate` with the new image.
5. Restart the server, worker and frontend, then check `quro doctor` and readiness.

Migrations only move forward. Going back means the old image plus the pre-upgrade backup. A PostgreSQL major version change is a separate step: back up with matching client tools, start the new major on a new data directory, restore, check row counts, and keep the old directory until you delete it yourself.

### Restart

Stopping and starting the containers keeps all data. Nothing runs on start except the server; migrations run only when you run `quro migrate`.

### Uninstall and keep data

`docker compose down` removes the containers and networks and keeps named volumes, bind-mounted directories, the settings file, secrets and backups. Removing images is safe. Deleting data is always a separate, manual step: `docker compose down --volumes` deletes named volumes, and deleting the data directories deletes everything in them.

### Not supported

PostgreSQL servers other than 18, running PostgreSQL on a data directory from another major, upgrading from a release before 0.8.0, and going back to an older version without a backup. More than one server against one database is not tested; rate limits are kept per process.

## Document storage evaluation

| Concern                 | Filesystem (default)                                                  | S3-compatible (optional)                                                                                                                         |
| ----------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Default install         | Nothing extra                                                         | **0.7.0:** two more services (`minio`, `minio-init`) and two more secrets                                                                        |
| Availability            | Nothing to pull                                                       | The MinIO tag pinned in 0.7.0 cannot be pulled without an account (rechecked 2026-10-09). The project does not vet replacement builds            |
| Provisioning            | A directory writable by the backend UID                               | Bucket, user and policy, created with provider tools. **0.7.0:** only the development Compose file creates them                                  |
| Backup                  | Same archive as the database dump, consistent while writes are paused | Objects copied with S3 tools. A store that encrypts at rest (for example MinIO with a KMS key) cannot be backed up by copying its data directory |
| Restore and portability | Copy or extract a directory on any host                               | Needs an S3 store and credentials at the destination; keys stay the same                                                                         |
| Permissions             | Host file ownership (see [File ownership](#file-ownership))           | Credentials and a bucket policy                                                                                                                  |
| Encryption at rest      | The host's disk encryption                                            | The store's server-side encryption; uploads request it today                                                                                     |
| Several hosts           | The server and the import worker share one directory                  | The server and the worker can run on different hosts                                                                                             |
| Data volume             | PDF statements, at most 25 MB each (the frontend's upload limit)      | Same                                                                                                                                             |

Result: the filesystem is the better default for a single-host self-hosted install. It removes the largest source of failed installs and lets one backup command cover all user data. S3 stays for operators who already run object storage or split services across hosts. Moving from S3 to the filesystem is `quro documents migrate-from-s3`; it reads through the S3 API, so it works with encrypted stores, and it never deletes the source objects.

## Measurements

A throwaway prototype of the `quro` entry point (a shell dispatcher over the existing scripts, not merged) was run against the image built from `e92dd51`, with `docker run` only and no Compose. Every run used synthetic data, a throwaway PostgreSQL 18.6 database on an internal Docker network with no outbound access, and `QRO_DISABLE_SCHEDULERS=1`.

Host: Apple silicon (arm64), Docker Desktop with Engine 29.5.3 and Compose v5.1.4. This is a clean Docker engine, not a clean virtual machine.

Cold image pulls into an empty engine (`docker:29-dind`, Engine 29.8.1, no registry credentials). Disk used is the engine's own report, which includes the downloaded layers as well as the unpacked files:

| Image                                        | Time | Disk used | Digest                                                                    |
| -------------------------------------------- | ---- | --------- | ------------------------------------------------------------------------- |
| `postgres:18-alpine`                         | 7 s  | 424 MB    | `sha256:77f585114c32fbca283dc835b0596f4e52b51b4c6662d7810b2f4084f60a1873` |
| `ghcr.io/pieter-ohearn/quro-backend:v0.7.0`  | 28 s | 1,191 MB  | `sha256:54fe1e7b485c83b8ca448faa843619c3e2e6e566491f0d929a970323bad2923d` |
| `ghcr.io/pieter-ohearn/quro-frontend:v0.7.0` | 4 s  | 94 MB     | `sha256:362710fd5d1e328a69f14446010d3af8cf7c6db22dfa62900114dfafad239d52` |

Fresh install with images present, from an empty directory (elapsed time since the start):

| Step                                                    | Elapsed |
| ------------------------------------------------------- | ------- |
| `quro init` wrote the settings file and two secrets     | 0.4 s   |
| PostgreSQL 18 initialised and accepting connections     | 2.1 s   |
| `quro migrate`: 38 migrations and the runtime role      | 2.9 s   |
| Server and frontend up, `/api/health` 200 through nginx | 3.7 s   |
| First account created through the frontend              | 3.9 s   |

Adding the cold pulls of the 0.7.0 images to these steps gives about 43 seconds of machine time from nothing to a first account on this host, 90 percent of it image download. The rest of an install is the operator reading and editing settings, which was not timed. Idle memory after the first account: backend 53 MiB, frontend 9 MiB, PostgreSQL 183 MiB (its data was on a memory-backed filesystem in that run).

What the prototype showed:

| Check                                                                                 | Result                                                                                                                                           |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Commands without Compose, database host not named `db`                                | `init`, `migrate`, `doctor`, `restore` and `serve` worked                                                                                        |
| Backend as UID 1000 with a read-only root filesystem and `/tmp` as tmpfs              | Worked; also as UID 12345 with no passwd entry                                                                                                   |
| `quro init` run twice                                                                 | Second run changed nothing (the prototype exited 3; the contract makes a complete directory exit 0)                                              |
| `quro migrate` run twice                                                              | Second run changed nothing                                                                                                                       |
| Two `quro migrate` runs at once on an empty database                                  | One succeeded, the other failed with a duplicate key on `pg_namespace`; 38 migrations recorded                                                   |
| Owner role with `CREATEROLE`, not superuser                                           | Migrations and runtime role succeeded                                                                                                            |
| Owner role without `CREATEROLE`, runtime role pre-created                             | Migrations succeeded; changing the role's password failed; applying the grants alone worked                                                      |
| Owner role without `CREATEROLE` and no runtime role                                   | `permission denied to create role`                                                                                                               |
| `pg_dump` 17.11 against PostgreSQL 18.6                                               | `server version mismatch`; a 0-byte file was left behind                                                                                         |
| `pg_dump` in the database container, restored with `quro migrate` then `quro restore` | Worked; user and migration counts matched the source                                                                                             |
| Restart of database and server                                                        | Data kept                                                                                                                                        |
| New named volume on an image that creates its data directory as UID 1000              | Writable without a `chown`                                                                                                                       |
| Linux bind mounts for a UID 1000 process                                              | Root-owned `0600` secret unreadable; owned by 1000 or group 1000 with `0640` readable; root-owned directory not writable until `chown 1000:1000` |
| Compose `uid`, `gid` and `mode` on a file-based secret (Compose v5.5.1)               | Ignored: the container saw `0:0 600` and UID 1000 could not read it                                                                              |
| Frontend with no host called `backend`                                                | nginx exited: `host not found in upstream "backend"`                                                                                             |
| Readiness with no S3 settings                                                         | 503, document storage `not_configured`                                                                                                           |
| Database password starting with `-` through the 0.7.0 entry point                     | URL encoding failed and printed Bun's usage text in place of the value                                                                           |

Not measured: a clean virtual machine, native amd64 hardware (the amd64 images were pulled and started under emulation, see [Distribution](distribution.md#recorded-evidence-v070)), a person following the steps with a stopwatch, and the filesystem storage driver itself (it does not exist yet).

## Decision log

| Date       | Decision                                                                                                                                                                                                                                                                                                                                                         |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-10-09 | Contract accepted: image subcommands, docs Compose example, filesystem storage by default.                                                                                                                                                                                                                                                                       |
| 2026-10-09 | Retire legacy settings and service-name defaults instead of inferring them; old configurations fail with exit code 2 and the upgrade notes list every change. Backend UID 1000, `QRO_` prefix for new settings, and `quro init` never prints secret values are confirmed.                                                                                        |
| 2026-10-10 | Outbound network clarified: installing needs no registry account, and the running core's only unconfigured outbound call is the scheduled Yahoo Finance refresh. An anonymous image check gates CI and releases; the updater is not a release requirement. Details in [Distribution](distribution.md).                                                           |
| 2026-10-10 | `quro doctor` is strictly read-only: its S3 check is a `HeadBucket` request with the configured key, and it never writes, reads back or deletes an object.                                                                                                                                                                                                       |
| 2026-10-12 | PostgreSQL 18 is the only supported server. Upgrades are supported from 0.8.0 on: the transition from Compose installs of 0.7.0 and earlier, its retired-settings table and the detection of those settings are removed. The JSON outputs and the readiness report may change in any 0.x release and are stable from 1.0.0.                                      |
| 2026-10-13 | Bank-link secrets are stored encrypted with one operator-held key file, `QRO_SECRETS_KEY_FILE`, without a value form, since secrets are files. `quro init` generates it and the example Compose file mounts it into `migrate` and `backend`. `quro secrets` encrypts existing values and rotates the key; `quro doctor` reports their state and stays read-only. |
