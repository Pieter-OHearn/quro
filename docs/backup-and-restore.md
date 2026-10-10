# Backup and restore

This guide is for someone who runs Quro and wants to be able to get their data back. It assumes you have never taken a backup of Quro before. It covers the first backup, encrypted copies on another device, scheduled backups, restoring onto the same or a new machine, and checking that a restore worked. For local development see [development](development.md).

The commands are `quro backup` and `quro restore` in the backend image. The examples run them through the `db-tools` service of the Docker Compose stack in this repository, from the checkout that holds your `docker-compose.yml`, `.env` and `secrets/` directory. [Without Compose](#without-compose) shows the same commands with `docker run` and from a checkout.

## Start here

If you have no backup yet, do these steps today. They take a few minutes.

1. Make sure Quro is running (`docker compose ps`). A backup can be taken while it runs.
2. Take a backup:

   ```bash
   mkdir -p backups
   docker compose --profile maintenance run --rm --entrypoint quro db-tools backup
   ```

   The archive is written to `./backups`, for example `./backups/quro-backup-20261010-031500Z.tar`. The command reads it back and checks every checksum before it keeps it, and prints what it holds.

3. Copy that file to another device: a USB disk, a NAS, another computer. A backup on the same disk does not survive the disk. [Encrypt](#encrypt-archives-and-copy-them-off-the-device) the archives before they leave the machine.
4. Copy `.env` and the `secrets/` directory to a safe place as well, separately from the archives (see [what is not in an archive](#what-an-archive-contains)). Without the database passwords the archive still restores, but you will have to set new ones.
5. [Schedule](#schedule-backups) a daily backup.
6. [Rehearse a restore](#rehearse-a-restore) on another machine or in a separate checkout, so the first restore you ever run is not during an incident.

Installs up to 0.7.0 have no `quro` command. Before upgrading such an install, take a database dump with the database container's own `pg_dump` as described in [Before upgrading](install-contract.md#before-upgrading), and copy the documents. Once the new release runs, take your first `quro backup`.

## What an archive contains

One archive is one file. It is a tar file (`.tar`), or an encrypted one (`.tar.enc`).

| In the archive                                                                          | Notes                                                                                                                                  |
| --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `database.dump`: every table (accounts, ledgers, settings, sessions, bank links, users) | A PostgreSQL custom-format dump, taken with client tools at least as new as the server                                                 |
| `documents/…`: every uploaded PDF, with [filesystem storage](document-storage.md)       | Payslips, pension statements and statement imports, under their storage keys                                                           |
| `manifest.json`                                                                         | The Quro version, the last applied migration, a SHA-256 of the dump and of every document, and a row count and checksum of every table |

| Not in the archive                                                           | Keep it like this                                                                                                     |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `.env` (or your settings file)                                               | A copy next to your secrets copy                                                                                      |
| `secrets/*.txt`: database passwords, the S3 secret key, the bunq credentials | A copy only you can read, not next to the archives                                                                    |
| The backup encryption key                                                    | Somewhere other than the archives, for example a password manager. Without it an encrypted archive cannot be restored |
| Documents with S3 storage (`QRO_DOCUMENT_STORAGE=s3`)                        | Copy the bucket with your store's tools; the manifest lists every object the database refers to                       |

The manifest records this split under `secrets`. Treat every archive as sensitive: the dump holds your financial records, password hashes and the tokens of any connected bank account. Unencrypted archives are written readable by their owner only.

## How a backup stays consistent

Rows in the database refer to documents, so the dump and the documents must be from the same moment. While `quro backup` copies them, Quro is in maintenance mode:

- The server answers every change (any request other than `GET`, `HEAD` and `OPTIONS`) with `503 Service Unavailable`, a `Retry-After: 60` header and the message _Quro is being backed up or restored, so changes are paused_. Reading keeps working.
- Background jobs (price and exchange-rate refreshes, bank sync, net-worth snapshots, session cleanup, the statement import worker) skip their turn and run again at the next one.
- Changes and job runs that had already started finish first. From the moment the backup asks for maintenance mode, new changes are refused, so a busy instance cannot hold the backup off. It waits up to 600 seconds (`--wait`) and then gives up with exit code 1 without writing anything.
- The pause ends as soon as the dump and the documents are copied. The command prints how long it took (`Changes resumed after 0.9 s`); checking the archive happens afterwards.
- Maintenance mode is a lock in the database, held by the backup's own connection. It covers every server and worker process, and if the backup is killed, the database releases it.

The server also shuts down gracefully: on `SIGTERM` (what `docker stop` and `docker compose stop` send) it stops accepting connections, finishes the requests and job runs in progress, closes its database connections and exits. Compose gives it 10 seconds by default; raise `stop_grace_period` if your instance needs longer.

## Back up

```bash
docker compose --profile maintenance run --rm --entrypoint quro db-tools backup
```

Options:

| Option             | Meaning                                                                                                                                                                 |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--label <name>`   | Adds a label to the file name, for example `--label before-upgrade` gives `quro-backup-20261010-031500Z-before-upgrade.tar`. Retention never deletes labelled archives. |
| `--output <dir>`   | Writes into another directory inside the container instead of `QRO_BACKUP_DIR` (`/var/lib/quro/backups`, which the Compose file maps to `./backups`).                   |
| `--wait <seconds>` | How long to wait for running changes and jobs before giving up (default 600).                                                                                           |

The archive is written under a hidden temporary name, read back and checked, and only then renamed into place. A backup that fails or is interrupted leaves nothing behind. Archive names use UTC time, so they sort in the order they were taken.

| Exit code | Meaning                                                                                                                                                 |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0         | The archive is written and checked (and copied, and older ones pruned, when configured)                                                                 |
| 1         | The backup failed, for example running changes did not finish in time, the off-device copy failed or retention could not delete a file. Read the output |
| 2         | A setting or option is wrong, for example the backup or documents directory does not exist, or `pg_dump` is older than the server. Nothing was written  |
| 3         | The database was migrated by a newer Quro than this image. Back up with the image that matches the database                                             |
| 4         | The database cannot be reached                                                                                                                          |

With filesystem storage, the output warns when the database refers to a document that is not in the documents directory. That document was already missing; the archive is still written.

### Encrypt archives and copy them off the device

Encryption uses a key file that you create once. Archives are then encrypted with AES-256-GCM, with a key derived from the file by scrypt; a wrong key, a changed byte or a cut-off file is detected when the archive is read.

1. Create the key and keep a copy somewhere other than the backups, for example in a password manager:

   ```bash
   openssl rand -hex 32 > secrets/backup_encryption_key.txt
   chmod 600 secrets/backup_encryption_key.txt
   ```

2. Put an override file next to `docker-compose.yml`, for example `compose.backup.yaml`. This one also copies every archive to a disk mounted at `/mnt/backup-disk` and keeps the 14 newest:

   ```yaml
   services:
     db-tools:
       environment:
         QRO_BACKUP_ENCRYPTION_KEY_FILE: /run/secrets/backup_encryption_key
         QRO_BACKUP_OFFSITE_DIR: /var/lib/quro/offsite
         QRO_BACKUP_KEEP: '14'
       secrets: [backup_encryption_key]
       volumes:
         - /mnt/backup-disk/quro:/var/lib/quro/offsite

   secrets:
     backup_encryption_key:
       file: ./secrets/backup_encryption_key.txt
   ```

3. Run backups with both files:

   ```bash
   docker compose -f docker-compose.yml -f compose.backup.yaml --profile maintenance run --rm --entrypoint quro db-tools backup
   ```

| Setting                          | Effect                                                                                                                                                                                                                                                                                                                            |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `QRO_BACKUP_ENCRYPTION_KEY_FILE` | Archives are encrypted (`.tar.enc`). The file holds at least 32 characters. Restoring and checking an encrypted archive needs the same file.                                                                                                                                                                                      |
| `QRO_BACKUP_OFFSITE_DIR`         | After the archive is checked, it is copied into this directory: a network share, a removable disk or a directory a sync tool sends elsewhere, mounted into the container. The copy is read back and compared with the archive before it is kept. Requires the encryption key: copies that leave the machine are always encrypted. |
| `QRO_BACKUP_KEEP`                | After the new archive (and its copy) have been checked, older unlabelled archives are deleted in each directory so that this many remain, counting the new one. Labelled archives and other files are never deleted. Unset keeps everything.                                                                                      |

Retention runs last. If writing, checking or copying fails, nothing is deleted. If a deletion fails, the command says which file and exits with code 1. Give every Quro instance a backup and off-device directory of its own: retention counts every archive in a directory.

Keep `QRO_BACKUP_DIR` on the machine itself. While a backup runs, `pg_dump` writes the database there unencrypted (readable by its owner only) before it goes into the archive, and a restore stages the archive's dump there; only the finished archive is encrypted. The off-device directory only ever receives finished, encrypted archives.

### Schedule backups

Quro does not schedule anything itself. Run the command from cron, a systemd timer or your NAS scheduler. A daily backup gives a recovery point objective of 24 hours. For example, every night at 03:15 (`-T` because cron has no terminal):

```bash
15 3 * * * cd /srv/quro && docker compose -f docker-compose.yml -f compose.backup.yaml --profile maintenance run --rm -T --entrypoint quro db-tools backup >> backups/backup.log 2>&1
```

Check the log, or alert on a non-zero exit code: a backup that fails every night protects nothing.

### With S3 storage

With `QRO_DOCUMENT_STORAGE=s3`, an archive holds the database and a manifest of every object the database refers to (key, recorded size and, for statement imports, SHA-256), and says that the documents are not included. Copy the bucket with your store's own tools, through the S3 API (a store that encrypts at rest, such as MinIO with a KMS key, cannot be backed up by copying its data directory). Uploads that happen between the archive and the bucket copy are in the bucket but not in the database, which is harmless. To get the documents into the archive, move them to the filesystem with `quro documents migrate-from-s3` (see [document storage](document-storage.md)).

## Check an archive

```bash
docker compose -f docker-compose.yml -f compose.backup.yaml --profile maintenance run --rm --entrypoint quro db-tools backup verify /var/lib/quro/backups/quro-backup-20261010-031500Z.tar.enc
```

`quro backup verify` reads the whole archive, decrypts it when needed, and compares the dump and every document with the checksums in the manifest. It needs no database. Run it now and then on the off-device copies too. Exit code 0 means the archive is complete; 1 means it is damaged, cut off or the key is wrong; 2 means the file does not exist or the key setting is missing.

## Restore

A restore replaces the database and the documents with the archive's. It refuses, and changes nothing, unless you confirm it and the target is safe to replace:

| Refusal (exit code 3)                                                                                           | What to do                                                                                                              |
| --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `Refusing to restore. Set QRO_RESTORE_CONFIRM=restore-db …`                                                     | Set it, after checking that you are pointing at the right database and archive                                          |
| `Refusing to restore while other database sessions are connected`                                               | Stop the backend, the import worker and any SQL client                                                                  |
| `Refusing to restore over a non-empty database or documents directory`                                          | Set `QRO_RESTORE_ALLOW_NON_EMPTY=1` if replacing the current data is what you want                                      |
| `The database's schema is not the archive's`                                                                    | The database was migrated to another version. Restore into a new, empty database (without running `quro migrate` first) |
| `The archive was written by Quro …, which is newer than this image` or `… a migration this image does not know` | Restore with the release that wrote the archive, or a newer one                                                         |

Other exit codes: 1 when the archive is damaged, cut off or the key is wrong (nothing is changed), or when the restored data does not match the archive; 2 when the archive does not exist, an encrypted archive has no key configured, a directory is missing, or an archive with documents meets `QRO_DOCUMENT_STORAGE=s3`; 4 when the database cannot be reached.

What `quro restore` does, in order:

1. Reads the whole archive and checks every checksum (and decrypts it), before it connects anywhere.
2. Checks the guards above and turns maintenance mode on.
3. If the database or the documents directory holds anything, writes a pre-restore archive of it into `QRO_BACKUP_DIR` (`quro-backup-…-pre-restore.tar`, encrypted when a key is configured). That archive is your way back.
4. Reads the archive again into a staging area, checking every checksum again.
5. Restores the database with `pg_restore` in a single transaction: a failure part way changes nothing.
6. Replaces the documents directory's content with the archive's documents. Documents added after the backup are removed; they are in the pre-restore archive.
7. Re-applies the runtime role's privileges.
8. Compares every table (row count and checksum of every row) and every document with the manifest and prints the result.

### Restore on the same install

1. Stop everything that writes:

   ```bash
   docker compose stop backend pension-import-worker
   ```

2. Restore, with your override file if the archive is encrypted:

   ```bash
   docker compose -f docker-compose.yml -f compose.backup.yaml --profile maintenance run --rm \
     -e QRO_RESTORE_CONFIRM=restore-db -e QRO_RESTORE_ALLOW_NON_EMPTY=1 \
     --entrypoint quro db-tools restore /var/lib/quro/backups/quro-backup-20261010-031500Z.tar.enc
   ```

3. If the output says the image has migrations newer than the archive, apply them:

   ```bash
   docker compose run --rm migrate
   ```

4. [Verify](#verify-a-restore), then start everything again with `docker compose up -d`.

### Restore on a new machine

This is the case after losing the disk or the machine. You need the archive, the encryption key if it is encrypted, and your copy of `.env` and `secrets/`.

1. Install the release the archive was taken with, or a newer one, following the README. Do not create an account.
2. Put your copies of `.env` and `secrets/` in place (including `secrets/backup_encryption_key.txt` and `compose.backup.yaml` for an encrypted archive), and the archive into `./backups`.
3. Start only the database, empty, and restore into it. Do not run the migrations first:

   ```bash
   docker compose up -d --wait db
   docker compose -f docker-compose.yml -f compose.backup.yaml --profile maintenance run --rm \
     -e QRO_RESTORE_CONFIRM=restore-db \
     --entrypoint quro db-tools restore /var/lib/quro/backups/quro-backup-20261010-031500Z.tar.enc
   ```

4. Apply the migrations of a newer release, if any, and start Quro:

   ```bash
   docker compose run --rm migrate
   docker compose up -d
   ```

If your secrets are lost too, create new password files before step 3. The restore sets the runtime role's password from `secrets/postgres_app_password.txt`. bunq has to be connected again only if its client credentials are lost.

### With S3 storage

The restore puts back the database. Restore the bucket with your store's tools to the state of the backup's day; the manifest's `documents.referenced` list says which objects the database needs.

## Verify a restore

`quro restore` already compares every table and document with the archive. Before you let people use the instance:

1. Review the pension statement imports **before** the import worker starts again. Overdue drafts can make the worker delete the PDFs you just recovered, and imports that were processing at backup time are not queued again on their own:

   ```bash
   docker compose --profile maintenance run --rm db-tools psql -c \
     'select id, status, expires_at, storage_deleted_at from pension_statement_imports order by id'
   ```

2. Start Quro, sign in, open a few accounts and download a few documents.
3. Sessions from the time of the backup are valid again. Run `quro user revoke-sessions` for accounts where that matters (see [the security model](security.md)).

If something is wrong, restore the pre-restore archive the command wrote, with the same steps.

## Rehearse a restore

Restore your latest archive into a separate checkout with an empty `./data` directory, or on another machine, and follow [Verify a restore](#verify-a-restore). Do it once now and after every upgrade.

The project runs the same rehearsal on every change: `scripts/recovery-drill.sh` (the `Recovery Drill` CI job) builds a synthetic instance with the demo seed, a partner with a joint and a private account, ledgers and uploaded PDFs, backs it up with `quro backup`, checks that missing, damaged, cut-off, wrong-key and newer-release archives are refused without changes, restores into an isolated PostgreSQL and documents volume, and compares every table, the ledger totals, the runtime role's privileges, every document's SHA-256, and sign-in and downloads through the API. It also takes a backup while a client keeps writing and checks retention and a restore over existing data. Run it with Docker:

```bash
sh scripts/recovery-drill.sh
```

## Recovery objectives

The targets are a recovery point objective (RPO) of 24 hours and a recovery time objective (RTO) of 60 minutes for one household.

- **RPO** is the time between backups plus the duration of one backup. A daily backup meets 24 hours. Changes made after the last backup are lost in a restore.
- **RTO** is the time from deciding to restore to signing in again. The machine part is measured below; the rest is a person's: finding the archive, the key and the settings copy, installing the release on a new machine (about a minute with images present, see [the install contract](install-contract.md#measurements)) and checking the result.

Measured with `scripts/recovery-drill.sh` on an Apple M1 (16 GB) with Docker Desktop (Engine 29.5.3, arm64, 8 CPUs and 7.75 GiB for the Linux VM), PostgreSQL 18.6, encrypted archives, every container on one machine. Times are end to end for the command, including container start, both checksum passes of a restore and the comparison afterwards. Each dataset was run twice on 2026-10-10 while other containers shared the machine; the slower run is shown:

| Dataset                                                   | Rows    | Documents    | Archive | Backup | Changes paused | Restore |
| --------------------------------------------------------- | ------- | ------------ | ------- | ------ | -------------- | ------- |
| Drill default (`QURO_DRILL_ROWS=1000`, 20 PDFs of 64 KiB) | 3,088   | 20, 1.3 MiB  | 1.4 MiB | 0.8 s  | 0.3 s          | 1.4 s   |
| Reference (`QURO_DRILL_ROWS=25000`, 200 PDFs of 512 KiB)  | 75,268  | 200, 100 MiB | 101 MiB | 2.3 s  | 1.0 s          | 3.1 s   |
| Large (`QURO_DRILL_ROWS=250000`, 500 PDFs of 1 MiB)       | 750,568 | 500, 500 MiB | 507 MiB | 13.1 s | 5.4 s          | 14.3 s  |

The reference dataset is about ten years of a busy household: 50,000 budget and 25,000 savings transactions, 200 statements and payslips. Even the large one restores in well under a minute of machine time, so the 60-minute RTO is spent on people, not on the restore.

Limits:

- Changes are refused for as long as the dump and the documents copy take; that grows with the data (about a second for the reference dataset, five for the large one). Schedule backups when nobody uses Quro.
- A backup needs free space for the archive and a temporary copy of the dump; a restore needs space for the pre-restore archive, a staged copy of the archive's content and, briefly, the previous documents.
- One encrypted archive can hold up to 64 GiB.
- Restoring into a PostgreSQL 16 server does not work with the image's PostgreSQL 18 tools: `pg_restore` 18 sets `transaction_timeout`, which 16 does not know, and stops before it changes anything. Backups of a 16 server work, and restore into PostgreSQL 17 or 18 (the baseline, see [PostgreSQL 18 and the upgrade from 16](postgresql-upgrade.md)). The drill passes on 17.11 and 18.6.
- Not measured: amd64, a Raspberry Pi or a NAS, network storage for the documents or the off-device directory, and restoring an S3 bucket.

## Restore a database dump

Files that end in `.dump` are bare PostgreSQL dumps: from the `db-tools backup` command of earlier releases, from `bun run db:backup`, or from `pg_dump` in the database container before an upgrade. `quro restore` does not take them. Restore one with the older command, which keeps the same confirmation guards and writes a `-pre-restore.dump` before it overwrites data:

```bash
docker compose stop backend pension-import-worker
docker compose --profile maintenance run --rm -e QRO_RESTORE_CONFIRM=restore-db \
  db-tools restore backups/db/<dump-file>.dump
```

Add `-e QRO_RESTORE_ALLOW_NON_EMPTY=1` to restore over data. A dump does not contain the documents; put back the documents directory from the copy you took with it. [PostgreSQL 18 and the upgrade from 16](postgresql-upgrade.md) uses this command for the database major upgrade.

## Without Compose

The commands read the same settings as the server (see [the install contract](install-contract.md#settings)): `POSTGRES_HOST` and the other database settings, the password files, `QRO_DOCUMENT_STORAGE` and `QRO_DOCUMENTS_DIR`, and the backup settings above. With `docker run`, mount the documents directory, the backup directory and the secrets:

```bash
docker run --rm --network quro_backend-net \
  -e POSTGRES_HOST=db -e QRO_DOCUMENT_STORAGE=filesystem \
  -v "$PWD/secrets/postgres_admin_password.txt:/run/secrets/postgres_admin_password:ro" \
  -v "$PWD/secrets/postgres_app_password.txt:/run/secrets/postgres_app_password:ro" \
  -v "$PWD/data/documents:/var/lib/quro/documents" -v "$PWD/backups:/var/lib/quro/backups" \
  --entrypoint quro ghcr.io/pieter-ohearn/quro-backend:<version> backup
```

From a checkout, with PostgreSQL client tools of the server's major version or newer on the machine (`QRO_PG_DUMP_BIN`, `QRO_PG_RESTORE_BIN` and, for the older dump commands, `QRO_PSQL_BIN` point at them when they are not on `PATH`; an older tool is refused with exit code 2 before anything is written):

```bash
bun run --filter '@quro/backend' quro backup --output /absolute/path/to/backups
```

`quro --help`, `quro backup --help` and `quro restore --help` describe every option.
