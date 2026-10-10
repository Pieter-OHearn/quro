# Install Quro

This guide installs Quro on one host with Docker Compose, from the release images and the example Compose file. It also covers an existing PostgreSQL server or S3-compatible store, the `quro` commands and what each one changes. The [install contract](install-contract.md) explains the decisions behind it.

The steps apply from 0.8.0. Images up to 0.7.0 have no `quro init`, `migrate` or `doctor` commands. CI runs these steps from empty directories on amd64 and arm64 for every change (`scripts/clean-install/run.sh`).

## Before you start

- A Linux host (amd64 or arm64) with Docker Engine and the Compose v2 plugin, about 2 GB of free disk and 512 MB of free memory. Docker Desktop on macOS works for trying Quro out.
- Access to Docker Hub and `ghcr.io`; no registry account is needed.
- Not needed: a GPU, an email server, a bank account, an object store.

## Install

1. Create a directory with a `config`, a `data/documents` and a `backups` directory, and copy [`docs/compose.example.yaml`](compose.example.yaml) into it as `compose.yaml`:

   ```bash
   mkdir -p quro/config quro/data/documents quro/backups
   cd quro
   cp /path/to/compose.example.yaml compose.yaml
   ```

2. On Linux, give the directories to UID 1000, the user the backend runs as. Skip this when `id -u` already prints `1000`, or on Docker Desktop:

   ```bash
   sudo chown 1000:1000 config data/documents backups
   ```

   Quro never creates the documents directory itself; when Docker creates a missing bind-mount source on Linux, it belongs to root and the backend cannot write to it.

3. Write the settings file and the database passwords:

   ```bash
   docker run --rm -v "$PWD/config:/config" ghcr.io/pieter-ohearn/quro-backend:v0.8.0 init
   ```

   This creates `config/quro.env` and `config/secrets/postgres_admin_password` and `config/secrets/postgres_app_password` (24 random bytes each, mode `0600`). The passwords are never printed. Running it again changes nothing.

4. Review `config/quro.env`. The defaults match the example Compose file. Set `SECURE_COOKIES=true` when browsers reach Quro over HTTPS (see the [security model](security.md)). On Linux the file belongs to UID 1000, so edit it with `sudo` unless that is you. If you change `POSTGRES_ADMIN_USER` or `POSTGRES_DB`, change them in the `db` service of `compose.yaml` too.

5. Start Quro:

   ```bash
   docker compose up -d
   ```

   The database starts, `migrate` creates the schema and the runtime role and exits, then the backend and the frontend start. `docker compose ps` shows the backend as `healthy` once it is ready.

6. Create the first account. Issue a registration code, open `http://<host>:3000` and enter the code in the sign-up form:

   ```bash
   docker compose exec backend quro user invite
   ```

   Later accounts need a code from the same command. A forgotten password is reset with `quro user reset-password <email>`.

7. Check the install:

   ```bash
   docker compose run --rm migrate doctor
   ```

Keep a copy of `compose.yaml`, `config/quro.env` and `config/secrets/` somewhere safe and separately protected. Backups of the database do not include them.

### Run as your own user instead

Instead of giving the directories to UID 1000, you can run the backend as your own user. Add `user: "<uid>:<gid>"` (from `id -u` and `id -g`) to the `migrate` and `backend` services, and run `quro init` with `--user "$(id -u):$(id -g)"`. Use bind mounts you own for every data directory: a new named volume is prepared for UID 1000.

## Existing PostgreSQL server

Leave the `db` service out of `compose.yaml` (and the `depends_on` that points at it) and point the settings at your server in `config/quro.env`: `POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_DB`, `POSTGRES_ADMIN_USER`, `POSTGRES_APP_USER`, and `POSTGRES_SSLMODE` for a server on another host. PostgreSQL 16, 17 and 18 are supported.

Create the database and its owner role with the password from `config/secrets/postgres_admin_password`. For the runtime role, either:

- give the owner `CREATEROLE`: `quro migrate` then creates the runtime role with the password from `config/secrets/postgres_app_password`, or
- create the runtime role yourself with `LOGIN` and that password: `quro migrate` then only applies its grants.

`quro migrate` checks this before it changes anything and stops with exit code 3, naming what to do, when neither is possible.

## Existing S3-compatible store

Documents are files under `data/documents` by default. To keep them in an S3-compatible store instead, create the bucket and an access key that can get, put, delete and list objects in it, then set in `config/quro.env`:

```bash
QRO_DOCUMENT_STORAGE=s3
S3_ENDPOINT=https://s3.example.com
S3_REGION=eu-west-1
S3_BUCKET=quro-documents
S3_ACCESS_KEY_ID=<access key id>
```

Put the secret key in `config/secrets/s3_secret_access_key`, add it to the `secrets` of the `migrate` and `backend` services (mounted as `/run/secrets/s3_secret_access_key`), and remove the `data/documents` mounts. `quro doctor` checks that the bucket can be reached. More in [document storage](document-storage.md).

## Commands

Every command runs from the backend image: `docker run --rm [mounts and settings] ghcr.io/pieter-ohearn/quro-backend:<version> <command>`, or in the example `docker compose run --rm migrate <command>` (owner and runtime passwords, documents) and `docker compose exec backend quro <command>` (runtime password only). `quro <command> --help` describes each one.

| Command                          | What it changes                                                                                                                                                                                                                                                                      |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `quro init [--dir] [--dry-run]`  | Creates the settings file, the `secrets/` directory (mode `0700`) and each password file (mode `0600`) in the directory (default `/config`) when they are missing. Never opens an existing file for writing. `--dry-run` lists what it would create.                                 |
| `quro migrate [--dry-run]`       | Applies pending migrations as the owner role, in one transaction. Creates the runtime role, or sets its password when the role exists and does not sign in with the password file, then grants it data access and read access to the migration history. `--dry-run` prints the plan. |
| `quro doctor [--json]`           | Nothing. Reads the settings and secret files and connects as both roles.                                                                                                                                                                                                             |
| `quro health`                    | Nothing. Asks the local server for `/api/readiness`.                                                                                                                                                                                                                                 |
| `quro version [--json]`          | Nothing. Prints the version, the newest bundled migration and the image revision.                                                                                                                                                                                                    |
| `quro serve`                     | Runs the API server (the image's default command). It never migrates.                                                                                                                                                                                                                |
| `quro worker pension-imports`    | Runs the optional statement import worker.                                                                                                                                                                                                                                           |
| `quro user …`                    | Registration and password reset codes, session revocation. See `quro user --help`.                                                                                                                                                                                                   |
| `quro documents migrate-from-s3` | Copies documents from S3 into the documents directory. See [document storage](document-storage.md).                                                                                                                                                                                  |

`quro migrate` runs one at a time per database: a second run waits for the first (a PostgreSQL advisory lock) and then finds nothing to do. A run that is stopped part way applies none of its migrations, so running it again is always safe. Before it changes anything it checks the host, the PostgreSQL version, that the owner role owns the database, that the schema is not newer than the image, and the runtime role.

Exit codes, for scripts and orchestrators:

| Code | Meaning                                                                                                                       |
| ---- | ----------------------------------------------------------------------------------------------------------------------------- |
| 0    | Done, or nothing to do                                                                                                        |
| 1    | The operation failed; read the output                                                                                         |
| 2    | Usage or settings are invalid, including retired settings that must be replaced. Nothing was changed                          |
| 3    | A safety check refused: schema newer than the image, missing database privileges, unsupported PostgreSQL. Nothing was changed |
| 4    | The database or document store cannot be reached; retry later                                                                 |

No command prints a password, a secret file's contents or a connection string with its password. Secret values reach the commands through files, never the command line.

## Readiness

`GET /api/readiness` returns 200 when the database answers, the schema matches the image and the document store is usable; otherwise 503 with a report. The backend's health check (`quro health`) uses it. When the schema is behind the image the report says to run `quro migrate`; when it is ahead (an older image after a newer one migrated the database), use the newer image or restore the backup taken before the upgrade.

## Restart and stop

`docker compose restart`, or `docker compose down` followed by `docker compose up -d`, keeps all data: the database volume, `data/documents`, the settings and the secrets. `docker compose down --volumes` deletes the database volume.

## Upgrades

Quro does not update itself. To upgrade, read the upgrade notes of every version you skip, take a backup with the old version (see [backup and restore](backup-and-restore.md)), change the image tags in `compose.yaml`, then run `docker compose up -d`; `migrate` applies the new migrations before the backend starts. Upgrading from 0.7.0 or earlier follows the 0.8.0 upgrade notes.
