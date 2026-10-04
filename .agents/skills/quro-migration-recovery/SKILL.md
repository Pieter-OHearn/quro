---
name: quro-migration-recovery
description: Change Quro PostgreSQL schema or rehearse database migration, backup and recovery on isolated synthetic resources. Use for schema and recovery work, not ordinary route or UI changes.
---

# Migration and recovery

Identify the source/target version and schema, isolated database, admin and runtime
roles, and backup location before running maintenance commands. Root AGENTS.md
safety rules apply; do not select resources from an inherited package .env.

For schema changes:

- Inspect `packages/backend/src/db/schema.ts`, `packages/backend/drizzle.config.ts`, and
  `packages/backend/src/db/migrations/meta/_journal.json`; generate with
  `bun run --filter '@quro/backend' db:generate`. Review new SQL, journal and snapshots
  together. Applied SQL stays immutable. Handwritten data migrations must also be
  registered in the journal and reconciled with the schema/snapshot chain.
- Test a fresh schema and an upgrade from representative prior synthetic rows.
  `packages/backend/src/db/partnerLinkMigration.test.ts` demonstrates connection-local temporary
  tables and rollback; `packages/backend/src/db/budget-currency-migration.test.ts` demonstrates
  preserving ambiguous provenance. Duplicate links must abort, not auto-delete;
  unknown legacy currency must remain reviewable, not guessed.
- Explicitly select `ADMIN_DATABASE_URL` for `db:migrate` and
  `APP_DATABASE_URL` for application tests. `packages/backend/src/db/config.ts` prefers these over
  `DATABASE_URL`; set all three to the intended isolated resources. Production
  migrations do not run under the restricted application role.

For recovery rehearsals, inspect `packages/backend/src/db/backup.ts`, `restore.ts`, `pgTools.ts`,
`maintenance.ts` and `runtimeRole.ts` before choosing commands:

1. Back up synthetic source data with `bun run db:backup -- --output <absolute-dump-path>`.
   PostgreSQL client tools are required (`pg_dump`, `pg_restore`, `psql`); explicit
   `QRO_PG_DUMP_BIN`, `QRO_PG_RESTORE_BIN`, `QRO_PSQL_BIN` can select their executables.
2. Stop app/worker/SQL sessions against the disposable restore target. Restore with
   `QRO_RESTORE_CONFIRM=restore-db bun run db:restore -- <absolute-dump-path>`.
   The target must be migrated so the pre-restore table summary can run. For an
   intentionally nonempty disposable target, `QRO_RESTORE_ALLOW_NON_EMPTY=1` requires
   verifying the target and backup first; the helper creates a pre-restore backup.
3. Confirm restored rows and constraints, migration journal, runtime role grants and
   application reads. Restore re-applies grants only when runtime role config is
   present. A DB dump excludes MinIO PDF objects; document/attachment recovery needs
   a separate synthetic object-store backup and matching metadata verification.
   Before restarting the worker, inspect import statuses, expiry dates,
   `storage_deleted_at` and committed document references: overdue drafts may delete
   recovered PDFs, and restored processing jobs are not automatically requeued.
   Inspect `packages/backend/src/routes/pension-imports.ts` and
   `packages/backend/src/workers/pensionImportWorker.ts` for the current transitions.

Prefer the custom dump produced by `db:backup`: custom restore uses
`--single-transaction`, while plain `.sql` uses `ON_ERROR_STOP` without atomicity.
Include a corrupt-input failure check in a recovery rehearsal.

Record commands, actual results, source/target state and cleanup. Distinguish SQL
unit checks from a real dump/restore rehearsal. Keep operator/live execution outside
this skill's synthetic testing scope unless explicitly authorized by the user.
