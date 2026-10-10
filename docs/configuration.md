# Configuration reference

This page lists every service, port, directory and setting of a Quro install made with [the install guide](install.md) and the [example Compose file](compose.example.yaml). It is for operators; the reasons behind the names and defaults are in the [install contract](install-contract.md).

Every backend setting is declared once in the code, and a test checks that this page has a row for each one with its default.

## Services

The example Compose file runs four services. Start order: `db` becomes healthy, `migrate` finishes with exit code 0, `backend` becomes healthy, then `frontend` starts. `docker compose up -d` waits for all of that.

| Service    | Image                                 | What it does                                                                             | Runs as                     | Health check                          |
| ---------- | ------------------------------------- | ---------------------------------------------------------------------------------------- | --------------------------- | ------------------------------------- |
| `db`       | `postgres:18.6-alpine3.23`            | PostgreSQL. Leave it out to use [your own server](install.md#existing-postgresql-server) | The image's `postgres` user | `pg_isready`, every 5 s               |
| `migrate`  | `ghcr.io/pieter-ohearn/quro-backend`  | `quro migrate` on every `docker compose up`, then exits. Also runs maintenance commands  | UID 1000                    | None; it exits                        |
| `backend`  | `ghcr.io/pieter-ohearn/quro-backend`  | `quro serve`: the API and the scheduled jobs                                             | UID 1000                    | `quro health` (readiness), every 10 s |
| `frontend` | `ghcr.io/pieter-ohearn/quro-frontend` | nginx: serves the web app, proxies `/api` to the backend, sets the security headers      | nginx's own users           | None                                  |

Use the same version for both Quro images and for `migrate` and `backend`. The statement import worker and its parser and model services are not in the example; they run from a checkout (see [development](development.md#optional-pension-import-development)).

### Ports

| Container | Port     | Exposure                                                                                                                                                                |
| --------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Frontend  | 80/tcp   | The only published port: `'3000:80'` publishes it on every interface of the host. Use `'127.0.0.1:3000:80'` behind a [reverse proxy](reverse-proxy.md) on the same host |
| Backend   | 3000/tcp | Internal; reached by the frontend over the `web` network. Never publish it                                                                                              |
| Database  | 5432/tcp | Internal; reached by `migrate` and `backend` over the `internal` network                                                                                                |

### Files and volumes

| Path on the host            | In the containers                                    | Holds                              | In `quro backup`          |
| --------------------------- | ---------------------------------------------------- | ---------------------------------- | ------------------------- |
| `config/quro.env`           | Read by Compose (`env_file`)                         | Settings                           | No; keep a copy           |
| `config/secrets/`           | `/run/secrets/<name>`, read-only                     | Passwords and keys, one per file   | No; keep a protected copy |
| Volume `<project>_postgres` | `/var/lib/postgresql` in `db`                        | The database cluster               | Yes, as a dump            |
| `data/documents/`           | `/var/lib/quro/documents` in `migrate` and `backend` | Uploaded PDFs (filesystem storage) | Yes                       |
| `backups/`                  | `/var/lib/quro/backups` in `migrate`                 | Backup archives                    | No                        |

The project name is `quro` unless you set another, so the volume is `quro_postgres`. On Linux, `config/`, `data/documents/` and `backups/` must belong to UID 1000, or the backend must run as their owner; see [file ownership](install-contract.md#file-ownership).

### Secret files

Each secret is one value in one file. A trailing newline is ignored; an empty file is an error. Compose mounts each file listed under a service's `secrets` at `/run/secrets/<name>`.

| File in `config/secrets/`              | Used by              | Written by  | Needed for                                                                                                    |
| -------------------------------------- | -------------------- | ----------- | ------------------------------------------------------------------------------------------------------------- |
| `postgres_admin_password`              | `db`, `migrate`      | `quro init` | Always: the owner role                                                                                        |
| `postgres_app_password`                | `migrate`, `backend` | `quro init` | Always: the runtime role                                                                                      |
| `s3_secret_access_key`                 | `migrate`, `backend` | You         | S3 document storage                                                                                           |
| `backup_encryption_key`                | `migrate`            | You         | Encrypted backups ([backup and restore](backup-and-restore.md#encrypt-archives-and-copy-them-off-the-device)) |
| `bunq_client_id`, `bunq_client_secret` | `backend`            | You         | bunq linking, unless the values are set directly                                                              |

## How settings are read

- The `migrate` and `backend` services read `config/quro.env` (`env_file` in `compose.yaml`). The frontend's one setting is in `compose.yaml`.
- `quro init` writes the file once, with every optional setting commented out at its default. It never changes the file again.
- After an edit, run `docker compose up -d`. Compose recreates the services whose settings changed and leaves the rest running.
- Every container checks all of its settings when it starts. Invalid values stop it with exit code 2 and one list of the problems; the list names settings, never values. An empty value counts as unset.
- The switches `S3_FORCE_PATH_STYLE`, `BUNQ_SANDBOX` and `QRO_DISABLE_SCHEDULERS` accept `true`, `false`, `1`, `0`, `yes` and `no`. `SECURE_COOKIES` and `OTEL_SDK_DISABLED` accept only `true` or `false`.
- Settings from earlier releases are not read; `quro doctor` names each one it finds and its replacement. See [retired settings](install-contract.md#retired-settings).

## Backend settings

The `migrate` and `backend` services, and every `quro` command, read these.

### Database

| Setting                        | Default                                | Notes                                                                                                          |
| ------------------------------ | -------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `POSTGRES_HOST`                | none, required                         | Host name or address of PostgreSQL. `db` in the example. Quro never assumes a service name                     |
| `POSTGRES_PORT`                | `5432`                                 |                                                                                                                |
| `POSTGRES_DB`                  | `quro`                                 | Database name. Keep it equal to `POSTGRES_DB` of the `db` service                                              |
| `POSTGRES_ADMIN_USER`          | `quro_admin`                           | Owner role: migrations, backup and restore. Keep it equal to `POSTGRES_USER` of the `db` service               |
| `POSTGRES_APP_USER`            | `quro_app`                             | Runtime role: data access only, no schema changes. `quro migrate` creates it                                   |
| `POSTGRES_ADMIN_PASSWORD_FILE` | `/run/secrets/postgres_admin_password` | Read only by commands that need the owner role (`migrate`, `backup`, `restore`, `doctor`), never by the server |
| `POSTGRES_APP_PASSWORD_FILE`   | `/run/secrets/postgres_app_password`   |                                                                                                                |
| `POSTGRES_SSLMODE`             | unset (client default)                 | `disable`, `allow`, `prefer`, `require`, `verify-ca` or `verify-full`, for a database on another machine       |

The `db` service has its own settings in `compose.yaml`: `POSTGRES_USER` and `POSTGRES_DB` must match `POSTGRES_ADMIN_USER` and `POSTGRES_DB` above, and its password comes from `POSTGRES_PASSWORD_FILE`, the same secret as `POSTGRES_ADMIN_PASSWORD_FILE`. Its health check repeats the user and database names.

### Web and sessions

| Setting                 | Default                                       | Notes                                                                                                                                                                                          |
| ----------------------- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SECURE_COOKIES`        | `false`                                       | `true` when browsers reach Quro over HTTPS (mode B), `false` for plain HTTP on a private network (mode A). Only `true` or `false`. See [deployment modes](security.md#deployment-modes)        |
| `QRO_REGISTRATION_MODE` | `invite`                                      | Who may create an account once the first one exists. `invite`: a single-use code per account. `closed`: nobody. `open`: anyone who can reach Quro. The first account always needs a setup code |
| `TRUSTED_PROXIES`       | none; `quro init` writes `172.16.0.0/12`      | Comma-separated IPs or IPv4 CIDRs allowed to set `X-Real-IP` and `X-Forwarded-For`, so rate limits apply per browser. Must cover the bundled nginx. See [proxy trust](security.md#proxy-trust) |
| `FRONTEND_ORIGIN`       | unset                                         | The public origin browsers use, for example `https://quro.example.com`. Required for bunq. When set, the backend warns at startup if `SECURE_COOKIES` does not match its scheme                |
| `CORS_ORIGIN`           | `http://localhost:3000,http://localhost:5173` | Origins allowed to call the backend directly. Not used through the bundled nginx, which serves the app and the API on one origin. `*` is not accepted                                          |
| `HOST`                  | `0.0.0.0`                                     | Interface the backend binds to inside its container                                                                                                                                            |
| `PORT`                  | `3000`                                        | Port the backend listens on inside its container. Change `QRO_API_URL` with it                                                                                                                 |

### Background jobs

| Setting                       | Default              | Notes                                                                                   |
| ----------------------------- | -------------------- | --------------------------------------------------------------------------------------- |
| `SESSION_CLEANUP_INTERVAL_MS` | `86400000 (one day)` | How often expired sessions and operator codes are purged, in milliseconds. At least `1` |

Exchange rates and holding prices refresh at start and once a day, from Yahoo Finance; net-worth snapshots are taken daily. None of them has a setting. See [privacy and network access](../README.md#privacy-and-network-access).

### Document storage

| Setting                     | Default                             | Notes                                                                                                                                                         |
| --------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `QRO_DOCUMENT_STORAGE`      | `filesystem`                        | `filesystem` or `s3`. When it is unset but `S3_ENDPOINT`, `S3_BUCKET` or `S3_ACCESS_KEY_ID` is present, every command stops instead of guessing               |
| `QRO_DOCUMENTS_DIR`         | `/var/lib/quro/documents`           | Absolute path of the filesystem store, and where `quro documents migrate-from-s3` copies to. Must exist and be writable by the backend; Quro never creates it |
| `S3_ENDPOINT`               | none; required with `s3`            | URL of the S3-compatible store, reachable from the containers                                                                                                 |
| `S3_REGION`                 | none; required with `s3`            | Region name the store expects                                                                                                                                 |
| `S3_BUCKET`                 | none; required with `s3`            | Bucket for uploaded documents. You create it                                                                                                                  |
| `S3_ACCESS_KEY_ID`          | none; required with `s3`            | Access key id of an identity that can get, put, delete and list objects in the bucket                                                                         |
| `S3_SECRET_ACCESS_KEY_FILE` | `/run/secrets/s3_secret_access_key` | File holding the secret access key                                                                                                                            |
| `S3_FORCE_PATH_STYLE`       | `true`                              | Path-style addressing, which most self-hosted stores need; `false` for stores that need virtual-host style                                                    |

More in [document storage](document-storage.md).

### Backups

| Setting                          | Default                 | Notes                                                                                                                                                   |
| -------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `QRO_BACKUP_DIR`                 | `/var/lib/quro/backups` | Where `quro backup` writes archives and `quro restore` writes its pre-restore archive. Must exist and be writable by the backend; Quro never creates it |
| `QRO_BACKUP_ENCRYPTION_KEY_FILE` | unset                   | File with a key of at least 32 characters. When set, archives are encrypted. The key is never in a backup: keep a copy elsewhere                        |
| `QRO_BACKUP_OFFSITE_DIR`         | unset                   | A directory on another device, mounted into the container. Every archive is copied there and the copy is checked. Needs the encryption key              |
| `QRO_BACKUP_KEEP`                | unset (keep all)        | Unlabelled archives kept per directory, counting the new one. Older ones are deleted only after the new archive is verified                             |

### Restore switches

These are set for one command, with `-e` on `docker compose run`, never in the settings file. See [backup and restore](backup-and-restore.md#restore).

| Setting                       | Default | Notes                                                |
| ----------------------------- | ------- | ---------------------------------------------------- |
| `QRO_RESTORE_CONFIRM`         | unset   | Must be `restore-db` for a restore to run            |
| `QRO_RESTORE_ALLOW_NON_EMPTY` | unset   | `1` allows a restore over a database that holds data |

### bunq

Bank linking with [bunq](https://www.bunq.com/) is off until one of these settings is present; then all of `BUNQ_CLIENT_ID`, `BUNQ_CLIENT_SECRET` (each as a value or a file), `BUNQ_REDIRECT_URI` and `FRONTEND_ORIGIN` are required, and a partial set stops the backend.

| Setting                   | Default                           | Notes                                                                                     |
| ------------------------- | --------------------------------- | ----------------------------------------------------------------------------------------- |
| `BUNQ_CLIENT_ID`          | unset                             | OAuth client id. A value set here wins over the file                                      |
| `BUNQ_CLIENT_ID_FILE`     | `/run/secrets/bunq_client_id`     | File holding the client id, used when `BUNQ_CLIENT_ID` is unset                           |
| `BUNQ_CLIENT_SECRET`      | unset                             | OAuth client secret. Prefer the file                                                      |
| `BUNQ_CLIENT_SECRET_FILE` | `/run/secrets/bunq_client_secret` | File holding the client secret, used when `BUNQ_CLIENT_SECRET` is unset                   |
| `BUNQ_REDIRECT_URI`       | unset                             | The redirect URI registered with bunq: your origin followed by `/api/bunq/oauth/callback` |
| `BUNQ_SANDBOX`            | `false`                           | `true` talks to the bunq sandbox instead of the production API                            |

A secret file alone, at its default path, does not switch bunq on. To use the files, add the secrets to the `backend` service and declare them in the top-level `secrets` of `compose.yaml`, as for [S3](install.md#existing-s3-compatible-store).

### Statement import

Reading pension statement PDFs needs the parser and model services, which run from a checkout with a GPU (see [development](development.md#optional-pension-import-development)). Without `PENSION_PARSER_URL`, statement import is off and its endpoints do not exist.

| Setting                          | Default  | Notes                                                                       |
| -------------------------------- | -------- | --------------------------------------------------------------------------- |
| `PENSION_PARSER_URL`             | unset    | Address of the parser service, for example `http://pension-parser:8080`     |
| `PENSION_PARSER_TIMEOUT_MS`      | `300000` | How long one statement may take to parse, in milliseconds                   |
| `IMPORT_DRAFT_TTL_DAYS`          | `7`      | Days an unconfirmed import draft is kept before it expires                  |
| `IMPORT_WORKER_POLL_INTERVAL_MS` | `3000`   | How often the import worker looks for work, in milliseconds. At least `500` |

### Tracing

Tracing is off until an endpoint is set. Spans go to an OTLP/HTTP collector you run.

| Setting                              | Default        | Notes                                                                                                                                               |
| ------------------------------------ | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `OTEL_EXPORTER_OTLP_ENDPOINT`        | unset          | Collector base URL, for example `http://otel-collector:4318`. The standard `OTEL_EXPORTER_OTLP_HEADERS` and `OTEL_EXPORTER_OTLP_TIMEOUT` also apply |
| `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` | unset          | Full traces URL. Overrides the base URL for traces                                                                                                  |
| `OTEL_SDK_DISABLED`                  | `false`        | `true` turns tracing off even when an endpoint is set. Only `true` or `false`                                                                       |
| `OTEL_SERVICE_NAME`                  | `quro-backend` | Service name on exported spans                                                                                                                      |

## Frontend settings

| Setting       | Default        | Notes                                                                                                                                                                  |
| ------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `QRO_API_URL` | none, required | The backend address nginx proxies `/api` to: `http://host:port`, without a path. `http://backend:3000` in the example. Without it, or with a path, the container stops |

The frontend has no other setting. Its nginx accepts uploads up to 25 MB and sets the content security policy and other headers described in [the security model](security.md#nginx-security-headers).

## Development and test settings

These exist for contributors and tests. Do not set them in an install.

| Setting                     | Default       | Notes                                                                                                                                         |
| --------------------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `NODE_ENV`                  | `development` | Only `test` changes behaviour: no rate limits and no background jobs                                                                          |
| `QRO_DISABLE_SCHEDULERS`    | `false`       | Turns off every background job, including the exchange-rate refresh. For tests that must not call a provider                                  |
| `DATABASE_URL`              | unset         | One connection URL for both roles. It carries a password in the environment, which is why installs use the separate settings and secret files |
| `ADMIN_DATABASE_URL`        | unset         | Connection URL for the owner role; wins over `DATABASE_URL`                                                                                   |
| `APP_DATABASE_URL`          | unset         | Connection URL for the runtime role; wins over `DATABASE_URL`                                                                                 |
| `BOOTSTRAP_DATABASE_URL`    | unset         | Superuser URL for `db:bootstrap-runtime-role` when the owner role cannot create roles                                                         |
| `QRO_PG_DUMP_BIN`           | unset         | Path to `pg_dump` outside the image                                                                                                           |
| `QRO_PG_RESTORE_BIN`        | unset         | Path to `pg_restore` outside the image                                                                                                        |
| `QRO_PSQL_BIN`              | unset         | Path to `psql` outside the image                                                                                                              |
| `QRO_CLEAR_CONFIRM`         | unset         | Must be `clear-all-data` for `db:clear`                                                                                                       |
| `QRO_CLEAR_ALLOW_NON_EMPTY` | unset         | `1` lets `db:clear` run on a database that holds data                                                                                         |
| `DEMO_USER_PASSWORD`        | unset         | Password of the demo account that `db:seed-demo` creates                                                                                      |

[Development](development.md) describes how a checkout uses them.
