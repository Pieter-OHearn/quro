# Backup and restore

This guide is for someone running Quro with the Docker Compose stack. It covers backing up the database and uploaded documents, restoring them, and checking that a restore worked. For local development setup see [development](development.md).

Run every `docker compose` command below from the repository checkout that holds your `docker-compose.yml`, `.env` and `secrets/` directory.

## What a backup contains

| Data                                                             | Where it lives                                                          | Covered by `backup`                       |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------- |
| Accounts, balances, transactions, settings, sessions, bank links | PostgreSQL (`./data/postgres-18`)                                       | Yes, as `<name>.dump`                     |
| Uploaded PDFs (payslips, pension statements, statement imports)  | `./data/documents` ([filesystem storage](document-storage.md), default) | Yes, as `<name>.documents.tar` next to it |
| Uploaded PDFs with S3 storage (`QRO_DOCUMENT_STORAGE=s3`)        | Your S3 bucket                                                          | **No**                                    |
| `.env` and `secrets/*.txt`                                       | Files in your checkout                                                  | **No**                                    |

Keep all of them. A database dump restores your records but not the PDFs they point to, and it does not restore your passwords and keys.

Treat every dump as sensitive. It holds your financial records and the tokens of any connected bank account. Store it somewhere only you can read, and do not commit it or share it.

## Back up the database

The `db-tools` service lives in the `maintenance` profile, so it only runs when you ask for it.

```bash
docker compose --profile maintenance run --rm db-tools backup
```

The dump is written to `./backups/db/<database>-<timestamp>.dump` on the host. For example, `quro-20261009-001322.dump`. With filesystem storage, the command then archives `./data/documents` (mounted read-only into `db-tools`) into `quro-20261009-001322.documents.tar` in the same directory. Both files are written under a temporary name first; the archive is readable by its owner only. To add a label to the file names:

```bash
docker compose --profile maintenance run --rm db-tools backup --label before-upgrade
```

The file is a PostgreSQL custom-format dump. You can take a backup while the stack is running. The backend image ships PostgreSQL 18 client tools, and the command refuses to run, before writing anything, when its `pg_dump` is older than the database server. Installs that still run a PostgreSQL 16 database in `./data/postgres` move to 18 by following [PostgreSQL 18 and the upgrade from 16](postgresql-upgrade.md). Copy the file off the machine as well, because a backup on the same disk does not protect you from losing the disk.

## Back up uploaded documents

Rows in the database refer to documents by key, so the dump and the documents belong together.

With filesystem storage (the default), `backup` already writes the documents archive next to the dump. It takes the dump first: an upload stores its file before it adds the row, so the archive holds every document the dump refers to, unless one is deleted between the two steps. For a backup that is consistent for certain, stop the services that write first:

```bash
docker compose stop backend pension-import-worker
docker compose --profile maintenance run --rm db-tools backup
docker compose up -d
```

If the documents directory is missing, the command writes the dump, reports that the documents are not in the backup, and exits with status 1.

With S3 storage, `backup` says that the documents are not included. Copy the bucket with your store's own tools at the same time as the dump. A store that encrypts at rest (for example MinIO with a KMS key) cannot be backed up by copying its data directory; read the objects through the S3 API instead.

A dump and a document copy taken on different days can disagree about which documents exist.

## Restore the database

A restore replaces the contents of the database with the contents of the dump.

1. Make sure the database schema exists. On an existing install it already does. On a new machine, start the database and run the migrations once:

   ```bash
   docker compose up -d db
   docker compose run --rm migrate
   ```

2. Stop everything that talks to the database:

   ```bash
   docker compose stop backend pension-import-worker
   ```

   Stop any other tool that has the database open too, including a `psql` session.

3. Restore. Pass the path to the dump relative to your checkout, and confirm the operation explicitly:

   ```bash
   docker compose --profile maintenance run --rm -e QRO_RESTORE_CONFIRM=restore-db \
     db-tools restore backups/db/<dump-file>.dump
   ```

   If the target database already holds data, the restore refuses to run until you also set `QRO_RESTORE_ALLOW_NON_EMPTY=1`. Do this only after you have checked that you are restoring into the right database and that you have a recent backup:

   ```bash
   docker compose --profile maintenance run --rm \
     -e QRO_RESTORE_CONFIRM=restore-db -e QRO_RESTORE_ALLOW_NON_EMPTY=1 \
     db-tools restore backups/db/<dump-file>.dump
   ```

   Before it overwrites a non-empty database, the command writes a safety backup named `<database>-<timestamp>-pre-restore.dump` into `./backups/db`. Keep it until you have verified the restore.

4. With filesystem storage, restore the documents from the archive with the same name as the dump. The backend writes as root in the current image, so on Linux run `tar` with `sudo` if `./data/documents` is owned by root:

   ```bash
   mkdir -p ./data/documents
   tar -xf backups/db/<dump-file>.documents.tar -C ./data/documents
   ```

   This adds the archived files and keeps any file uploaded after the backup; the restored database does not refer to those. With S3 storage, restore the bucket with your store's tools.

5. Check the result (next section) before you start the application again.

### Safety checks

The restore command stops with an error, and changes nothing, in these cases:

| Situation                                    | Message starts with                                                                            | What to do                                                                                                                                 |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `QRO_RESTORE_CONFIRM=restore-db` is not set  | `Refusing to restore the local database.`                                                      | Set it, after checking the target and the dump.                                                                                            |
| The database already has data                | `Refusing to restore over a non-empty database.`                                               | Set `QRO_RESTORE_ALLOW_NON_EMPTY=1` if that is what you intend.                                                                            |
| Another session is connected to the database | `Refusing to restore while other database sessions…`                                           | Stop the backend, the worker and any SQL client, then try again.                                                                           |
| The client tool is older than the server     | `pg_restore is PostgreSQL 17 but the database server is PostgreSQL 18.` (or `pg_dump`, `psql`) | Run the command from the backend image of this release, or point `QRO_PG_RESTORE_BIN` (`QRO_PG_DUMP_BIN`, `QRO_PSQL_BIN`) at a newer tool. |

A dump that is truncated or damaged fails with a `pg_restore` error. A `.dump` file is restored in a single transaction (`pg_restore --single-transaction`), so a restore that fails part way is rolled back. A plain `.sql` file is not restored atomically and can leave a half-restored database, so always restore the `.dump` files that `backup` creates.

## Verify a restore

Run these before you restart the backend.

1. Compare row counts with what you expect from the source. For example:

   ```bash
   docker compose --profile maintenance run --rm db-tools psql -c 'select count(*) from users'
   docker compose --profile maintenance run --rm db-tools psql -c 'select count(*) from savings_accounts'
   ```

2. Confirm the migration history came across. The count should match the number on the machine the dump came from:

   ```bash
   docker compose --profile maintenance run --rm db-tools psql -c 'select count(*) from drizzle.__drizzle_migrations'
   ```

3. Review the pension statement imports **before** the worker starts again. Overdue drafts can cause the worker to delete the PDFs you just recovered, and imports that were processing when the backup was taken are not queued again on their own:

   ```bash
   docker compose --profile maintenance run --rm db-tools psql -c \
     'select id, status, expires_at, storage_deleted_at from pension_statement_imports order by id'
   ```

4. Start the application and sign in:

   ```bash
   docker compose up -d
   ```

   Open a few accounts and pension documents and check the numbers and downloads against what you expect.

If something is wrong, restore the `-pre-restore.dump` file that the command created, or the previous dump, with the same steps.

## Rehearse before you need it

Restore into a copy of the stack on another machine, or in a separate checkout with an empty `./data` directory, and run the verification steps. Do this with a recent backup at least once, so the first time you meet these commands is not during an incident.

## Running the commands without Compose

If you run the backend directly from a checkout, the same scripts are available as `bun run db:backup` and `bun run db:restore -- <dump-file>`. They need the PostgreSQL client tools (`pg_dump`, `pg_restore`, `psql`) on the machine, and `db:backup` needs `tar` and `QRO_DOCUMENTS_DIR` to archive documents stored on the filesystem. To use binaries in a non-standard location, set `QRO_PG_DUMP_BIN`, `QRO_PG_RESTORE_BIN` and `QRO_PSQL_BIN` to their full paths. Use the same confirmation variables as above, and point `DATABASE_URL` and `ADMIN_DATABASE_URL` at the database you mean to change.
