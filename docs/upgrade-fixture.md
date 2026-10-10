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

[`upgrade.sh`](../scripts/upgrade-fixture/upgrade.sh) runs these steps with Docker and Bun:

1. PostgreSQL 16.11 loads `database.sql`; an S3 test double receives the documents.
2. The database moves to the PostgreSQL version in `docker-compose.yml` by dump and restore, each with its own server's client tools, into a new data directory, as in [PostgreSQL 18 and the upgrade from 16](postgresql-upgrade.md). The restore goes into an empty database, before any migration of the new version has run. Every table and sequence must be identical across the two versions.
3. The checkout's migrations run against the new database.
4. [`verify.ts`](../scripts/upgrade-fixture/verify.ts) compares the upgraded database with the 0.7.0 one and fails on any difference that [`expectations.ts`](../scripts/upgrade-fixture/expectations.ts) does not declare:
   - every table: row count, a checksum over all rows and null counts per column;
   - every numeric column: its total, per currency where the table has a `currency` column;
   - sequences: unchanged, or ahead where the migrations appended rows;
   - provenance columns (rate sources, bank ids, source amounts and currencies, review flags): row by row;
   - documents: every key a payslip, pension transaction or statement import refers to must be in the store with the recorded size and SHA-256, and no row may lose its document.
5. A one-cent change, a removed attachment row and a missing object must each make step 4 fail.

Run it locally the same way (it uses ports on 127.0.0.1 only and removes its containers):

```bash
sh scripts/upgrade-fixture/upgrade.sh
```

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

The test checks data, not the running application: it does not start a server, sign in, or exercise the operator commands of the new version. The backend test suite and the browser smoke tests cover those.
