# PostgreSQL 18 and the upgrade from 16

Quro is built and tested on PostgreSQL 18. PostgreSQL 16 and 17 servers keep working: CI runs the test suite on 16 and 18, and the backend image's backup tools (version 18) can dump all three. The Docker Compose stack in this repository now starts PostgreSQL 18. An existing install that still has a PostgreSQL 16 data directory moves to 18 by dumping the database and restoring it into a new data directory. This page is that procedure. For backups in general see [backup and restore](backup-and-restore.md).

## What changes

|                                   | Releases up to 0.7.0                                     | Now                                                    |
| --------------------------------- | -------------------------------------------------------- | ------------------------------------------------------ |
| Database image                    | `postgres:16.11-alpine3.23`                              | `postgres:18.6-alpine3.23`                             |
| Host directory                    | `./data/postgres`, mounted at `/var/lib/postgresql/data` | `./data/postgres-18`, mounted at `/var/lib/postgresql` |
| Backup tools in the backend image | PostgreSQL 17                                            | PostgreSQL 18                                          |
| Data checksums                    | off                                                      | on (the default for new PostgreSQL 18 clusters)        |

The PostgreSQL 18 image keeps its cluster in a versioned directory below `/var/lib/postgresql`, so the next major version can be upgraded in place. It cannot read a cluster written by 16, and Quro never points it at one: the new version always gets a new directory.

Why the backup tools matter: `pg_dump` stops with `server version mismatch` when it is older than the server. The 0.7.0 backend image has `pg_dump` 17, so its backup commands cannot back up a PostgreSQL 18 server. The `db:backup`, `db:restore` and `db:clear` commands now check this first. They stop before writing anything, and name the tool and both versions, when a client tool is older than the server (set `QRO_PG_DUMP_BIN`, `QRO_PG_RESTORE_BIN` or `QRO_PSQL_BIN` to a newer binary if you run them outside the image).

## Before you start

- Plan for a short outage: the app is stopped from the dump until the restore has been checked.
- You need free disk space for the dump and for a second copy of the database.
- Do the steps in this order. Steps 1 to 4 run against the old stack, so take them **before** you update the checkout (step 5); once the checkout is updated, `db` means PostgreSQL 18.
- The commands assume the Compose stack of this repository and run from the checkout that holds `docker-compose.yml`, `.env` and `secrets/`. If you run a release file instead, take the dump with the same `docker compose exec -T db ... pg_dump` command and follow the upgrade notes of the release.
- Nothing below deletes anything. The old directory `./data/postgres` stays where it is.

## Upgrade a Compose install from 16 to 18

1. Get the fingerprint query of the release you are installing without updating your checkout yet, check what you are upgrading from, and stop everything that writes to the database. The database keeps running. (An older checkout does not contain the query file.)

   ```bash
   git fetch --tags
   mkdir -p backups/db
   git show <tag>:scripts/pg-table-fingerprint.sql > backups/db/pg-table-fingerprint.sql
   docker compose exec -T db postgres --version
   docker compose stop frontend backend pension-import-worker
   ```

   Replace `<tag>` with the release tag. The `postgres --version` command should print a PostgreSQL 16 version. Do not continue if it does not.

2. Record a fingerprint of the old database. It lists each table with its row count and a checksum of its rows, and each sequence with its last value. It contains no row data.

   ```bash
   docker compose exec -T db sh -c 'psql -X -At -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
     < backups/db/pg-table-fingerprint.sql | LC_ALL=C sort > backups/db/fingerprint-before.txt
   ```

3. Back up with the old server's own tools, which always match its version. `-T` matters: without it Compose attaches a terminal that can corrupt the binary dump.

   ```bash
   docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom' \
     > backups/db/pre-pg18-upgrade.dump
   ls -l backups/db/pre-pg18-upgrade.dump
   docker compose exec -T db pg_restore --list < backups/db/pre-pg18-upgrade.dump | head -n 5
   ```

   The file must be more than a few kilobytes and `pg_restore --list` must print the start of the archive's table of contents. Treat the dump as sensitive: it holds your financial records and bank tokens. Also keep copies of `.env`, `secrets/` and `./data/minio`; see [backup and restore](backup-and-restore.md#back-up-uploaded-documents).

4. Stop the stack.

   ```bash
   docker compose down
   ```

5. Update the checkout to the release you are installing (for example `git fetch --tags && git checkout <tag>`), then rebuild the images. The backend image now ships the PostgreSQL 18 tools.

   ```bash
   docker compose --profile maintenance build
   ```

6. Start PostgreSQL 18. It creates an empty cluster in the new directory `./data/postgres-18`.

   ```bash
   docker compose up -d --wait db
   docker compose exec -T db postgres --version
   ```

7. Create the schema and the runtime role in the new database.

   ```bash
   docker compose run --rm migrate
   ```

8. Restore the dump. The target is empty, so no overwrite flag is needed.

   ```bash
   docker compose --profile maintenance run --rm -e QRO_RESTORE_CONFIRM=restore-db \
     db-tools restore backups/db/pre-pg18-upgrade.dump
   ```

9. Verify before the application starts. The fingerprints must be identical, and data checksums must be on.

   ```bash
   docker compose --profile maintenance run --rm -T db-tools psql -X -At \
     < backups/db/pg-table-fingerprint.sql | LC_ALL=C sort > backups/db/fingerprint-after.txt
   diff backups/db/fingerprint-before.txt backups/db/fingerprint-after.txt && echo identical
   docker compose exec -T db sh -c 'psql -X -At -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "show data_checksums"'
   ```

   The `diff` prints nothing and `identical` appears; the last command prints `on`. If the fingerprints differ, do not start the application: go to [If something is wrong](#if-something-is-wrong).

10. Start the application, sign in and check a few accounts.

    ```bash
    docker compose up -d
    ```

11. Keep `./data/postgres` and the dump until you are sure. Delete them by hand when you are, not before. Until then they are your way back.

## If something is wrong

- **The new database does not match.** Nothing has touched the old data. Stop the stack with `docker compose down`, remove the new directory `./data/postgres-18`, and run steps 6 to 9 again, or check out the previous release (its Compose file points at `./data/postgres` again) and start it. Keep the dump and the fingerprint files and note the first differing line of `diff`.
- **You started PostgreSQL 18 on the old directory.** The 18 image refuses to start on a PostgreSQL 16 data directory, mounted at either `/var/lib/postgresql/data` or `/var/lib/postgresql`, and exits with an error that names the directory. The directory is not modified. Use a new directory.
- **A backup command says the tool is older than the server.** You are running the command with PostgreSQL client tools older than the server. Run it from the backend image of this release, or point `QRO_PG_DUMP_BIN`, `QRO_PG_RESTORE_BIN` or `QRO_PSQL_BIN` at tools of the server's version or newer.
- **You want to go back after using the application on 18.** Data written on 18 is not in the old directory. Take a dump from 18 first (`db-tools backup`), then decide; restoring it into a 16 server is not tested.

## Development checkouts

`docker compose up` in a development checkout now starts an empty PostgreSQL 18 database in `./data/postgres-18`. Your earlier development database stays in `./data/postgres`, untouched. Either reseed (`bun run --filter '@quro/backend' db:seed-demo` against a migrated database) or carry the old data over with the steps above. For tests, use a throwaway container as described in [development](development.md#db-backed-tests); CI runs the suite on 16 and 18, so changes that touch SQL should pass on both.

## How this is tested

`scripts/rehearse-pg-upgrade.sh` (also the `PostgreSQL Upgrade Rehearsal` CI job) runs this procedure on a throwaway Docker stack with synthetic data, using the backend image's own tools:

- PostgreSQL 16 is migrated and filled with the demo seed plus [synthetic edge-case rows](../scripts/fixtures/pg-upgrade-synthetic.sql) (large and tiny amounts, negative balances, several currencies, nulls, jsonb, non-ASCII text).
- The database is dumped with the 16 server's own `pg_dump`, and PostgreSQL 18 starts on a new volume.
- `db:migrate` and `db:restore` load the dump on 18, and the fingerprint must equal the one taken on 16.
- `db:backup` dumps the 18 server and `db:restore` loads that dump into a second database; the fingerprint must equal again.
- The 18 image must refuse the 16 directory at both mount points, and the 16 directory must still start with the same fingerprint afterwards.
- A one-cent change to a copy must change the fingerprint, so the comparison cannot pass vacuously.

Run it locally with Docker (it builds the backend image when `quro-backend:ci` is missing):

```bash
sh scripts/rehearse-pg-upgrade.sh
```
