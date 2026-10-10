# Upgrade test from 0.7.0

Installs that run 0.7.0 have to reach the current version with every row, value and document intact. The upgrade test proves that on every pull request: it takes a synthetic 0.7.0 installation, upgrades it to the commit under test, and compares the result with what it started from. It is the `Upgrade from 0.7.0` job in CI and part of the required `CI` check.

Everything in the fixture is synthetic. Do not add real data, data copied from an installation, or anything that looks like a real person, account number or bank export.

## What the fixture holds

`scripts/upgrade-fixture/v0.7.0/` is a 0.7.0 installation at rest:

| File               | What it is                                                                                                                          |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| `database.sql`     | A plain-SQL `pg_dump` of the 0.7.0 database (PostgreSQL 16.11): schema, migration history, grants to the runtime role and all rows. |
| `documents/<key>`  | The objects of the 0.7.0 document bucket, one file per S3 key.                                                                      |
| `documents.sha256` | The SHA-256 of every object, in `sha256sum` format.                                                                                 |

Plain SQL and loose files keep the fixture small (about 130 KB), readable in a diff and independent of any binary dump format. The data is the 0.7.0 demo seed plus [`edge-cases.sql`](../scripts/upgrade-fixture/edge-cases.sql): four users (two of them partners in one household with joint and private rows, one pending invitation), rows in every 0.7.0 table, amounts at the edges of `numeric(19,2)`, negative balances and negative property equity, all eight currencies, nulls next to values, jsonb, non-ASCII text, bank provenance columns, raw session tokens, and five PDFs: two payslips, a statement uploaded by hand, a committed statement import that shares its object with the transaction it created, and an import waiting for review. A sixth, expired import refers to an object 0.7.0 already deleted.

## What the test does

[`upgrade.sh`](../scripts/upgrade-fixture/upgrade.sh) takes the fixture through the upgrade the way [Upgrade Quro](upgrade.md#upgrade-from-070-to-080) tells an operator to, and injects the failures that guide covers:

1. PostgreSQL 16.11 loads `database.sql`; an S3 test double receives the documents.
2. The database moves to the PostgreSQL version in `docker-compose.yml` by dump and restore, each with its own server's client tools, into a new data directory. The restore goes into an empty database, before any migration of the new version has run. Every table and sequence must be identical across the two versions.
3. Before `quro migrate`, the backend image built from the checkout starts as a server with the example Compose file's health check. It must stay not ready: `GET /api/readiness` answers `503` with the schema's reason, `quro health` exits 1, Docker reports the container `unhealthy`, and `quro migrate --status --json` reports the pending migration with exit code 1. A configuration written for 0.7.0 (no `POSTGRES_HOST`, S3 settings without `QRO_DOCUMENT_STORAGE`) and the 0.7.0 server command must stop with exit code 2.
4. Failures change nothing: a `quro migrate` that fails on an object in its way, and one killed while it records its migration, leave every table and sequence as restored. Two `quro migrate` runs started at once both succeed: one applies the migration, the other waits for the lock and finds nothing to do. A further run changes nothing.
5. The server becomes ready without a restart. A schema newer than the image is refused by `quro migrate` and `quro migrate --status` (exit code 3) and reported by readiness (`schema_ahead`).
6. [`verify.ts`](../scripts/upgrade-fixture/verify.ts) compares the upgraded database with the 0.7.0 one and fails on any difference that [`expectations.ts`](../scripts/upgrade-fixture/expectations.ts) does not declare:
   - every table: row count, a checksum over all rows and null counts per column;
   - every numeric column: its total, per currency where the table has a `currency` column;
   - sequences: unchanged, or ahead where the migrations appended rows;
   - provenance columns (rate sources, bank ids, source amounts and currencies, review flags): row by row;
   - documents: every key a payslip, pension transaction or statement import refers to must be in the store with the recorded size and SHA-256, and no row may lose its document.
7. `quro documents migrate-from-s3` stops with exit code 1 and adds nothing while a needed object is missing from S3; with the object back it copies every document, and step 6 is repeated against the documents directory.
8. A one-cent change, a removed attachment row and a missing object must each make step 6 fail.
9. On S3 and then on the filesystem store, the server keeps a browser signed in with a session cookie from 0.7.0 (an expired one stays out), and every fixture user signs in and downloads their documents, byte for byte ([`exercise.ts`](../scripts/upgrade-fixture/exercise.ts)).
10. A document missing from S3 stops `quro documents migrate-from-s3` until its owner removes the attachment in the app; then the copy completes.

Run it locally the same way. It builds the backend image as `quro-backend:ci` when that tag is missing (set `QURO_BACKEND_IMAGE` to test another tag), publishes ports on 127.0.0.1 only, runs the server with schedulers off and removes its containers:

```bash
sh scripts/upgrade-fixture/upgrade.sh
```

The [PostgreSQL upgrade rehearsal](postgresql-upgrade.md#how-this-is-tested) starts from the same fixture.

## When your migration changes existing data

A migration that adds a table or column, rewrites values or removes rows fails the upgrade test until `expectations.ts` declares what it does. That is deliberate: the declaration is the reviewable statement of what happens to an operator's data. Add one entry per table, in the same pull request as the migration:

| Field              | Use it for                                                                                 |
| ------------------ | ------------------------------------------------------------------------------------------ |
| `newTable`         | A table that did not exist in 0.7.0, with the number of rows the migrations leave in it    |
| `addedColumns`     | A new column, with SQL over the 0.7.0 row that gives the value existing rows must get      |
| `rewrittenColumns` | A column whose values change, with SQL over the 0.7.0 row that gives the new value         |
| `keptRows`         | A condition on the 0.7.0 row for the rows that must survive, when a migration deletes rows |
| `appendedRows`     | Rows the migrations add to an existing table, after the 0.7.0 rows by an integer key       |

For example, the migration that stores session ids as digests is declared as:

```ts
'public.sessions': {
  rewrittenColumns: { id: "encode(sha256(convert_to(id, 'UTF8')), 'hex')" },
  addedColumns: { last_used_at: 'created_at', user_agent: 'null::text' },
},
```

Dropping a column or table always fails. Removing user data needs the maintainers' approval and a backup instruction in the release notes first. New provenance or document columns go into `PROVENANCE_COLUMNS` and `ATTACHMENTS` in the same file.

## Regenerating the fixture

The fixture describes 0.7.0 and should rarely change. Never regenerate it to make a failing upgrade pass. When the synthetic data itself needs to change, edit `edge-cases.sql` (and `documents.ts` for documents), then:

```bash
sh scripts/upgrade-fixture/generate.sh          # rewrites scripts/upgrade-fixture/v0.7.0
sh scripts/upgrade-fixture/generate.sh --check  # a second run must produce identical files
```

[`generate.sh`](../scripts/upgrade-fixture/generate.sh) builds the installation with the published 0.7.0 backend image, pinned by digest, on an internal Docker network without internet access: the image migrates the database and creates its runtime role with its own scripts, runs its demo seed, and stores the PDFs with its own S3 upload code. [`normalize.sql`](../scripts/upgrade-fixture/normalize.sql) fixes the values the seed takes from the clock or a random salt, so two runs produce the same bytes. The 0.7.0 server itself never starts, so none of its scheduled provider calls can run. If the recorded size or SHA-256 of a document no longer matches `documents.ts`, the generator stops and prints the values to put in `edge-cases.sql`.

## What it does not cover

The frontend image, a reverse proxy, the import worker and the operator's own Compose file are not part of this test; the [clean-install test](install.md) covers the frontend and the example Compose file. The guide's Compose commands were last run end to end, against the published 0.7.0 images and images built from the checkout, when the guide changed.
