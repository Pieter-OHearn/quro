import { parseArgs } from 'node:util';
import { createQueryClient } from './client';
import { getAdminDatabaseUrl, redactDatabaseUrl } from './config';
import {
  assertConfirmation,
  clearCountPlan,
  getDatabaseSummary,
  logDatabaseSummary,
  resolvePathFromCwdOrRepo,
  sumTableCounts,
} from './maintenance';
import { createDatabaseBackup, restoreDatabaseBackup } from './pgTools';
import { ensureRuntimeRole, getRuntimeRoleConfigFromEnv } from './runtimeRole';

type ConnectionCountRow = {
  count: number;
};

async function main() {
  const { positionals } = parseArgs({
    allowPositionals: true,
    options: {},
    strict: true,
  });
  const inputArgument = positionals[0];

  if (!inputArgument) {
    throw new Error('Missing backup path. Usage: bun run db:restore -- <path-to-dump>');
  }

  assertConfirmation('QRO_RESTORE_CONFIRM', 'restore-db', 'restore the local database');

  const backupPath = await resolvePathFromCwdOrRepo(inputArgument);
  const connectionString = getAdminDatabaseUrl();
  console.log(`Preparing restore against ${redactDatabaseUrl(connectionString)}`);
  console.log(`Restore source: ${backupPath}`);

  const sql = createQueryClient(connectionString, { max: 1 });
  try {
    const summary = await getDatabaseSummary(sql, clearCountPlan);
    logDatabaseSummary(summary, 'Pre-restore summary');

    const existingRows = sumTableCounts(summary.tableCounts);
    if (existingRows > 0 && process.env.QRO_RESTORE_ALLOW_NON_EMPTY !== '1') {
      throw new Error(
        'Refusing to restore over a non-empty database. Set QRO_RESTORE_ALLOW_NON_EMPTY=1 after verifying the target database and latest backup.',
      );
    }

    const [activeConnections] = await sql<ConnectionCountRow[]>`
      select count(*)::int as count
      from pg_stat_activity
      where datname = current_database()
        and pid <> pg_backend_pid()
    `;
    if ((activeConnections?.count ?? 0) > 0) {
      throw new Error(
        'Refusing to restore while other database sessions are connected. Stop the backend, worker, and any local SQL clients first.',
      );
    }

    if (existingRows > 0) {
      const preRestoreBackupPath = await createDatabaseBackup({
        connectionString,
        label: 'pre-restore',
      });
      console.log(`Automatic pre-restore backup: ${preRestoreBackupPath}`);
    } else {
      console.log('Target database is empty. No pre-restore backup was needed.');
    }
  } finally {
    await sql.end({ timeout: 5 });
  }

  await restoreDatabaseBackup({ connectionString, inputPath: backupPath });
  console.log('Restore completed successfully.');

  const runtimeRoleConfig = getRuntimeRoleConfigFromEnv();
  if (runtimeRoleConfig) {
    const grantsClient = createQueryClient(connectionString, { max: 1 });
    try {
      await ensureRuntimeRole(grantsClient, runtimeRoleConfig);
      console.log(`Re-applied runtime role grants for ${runtimeRoleConfig.roleName}.`);
    } finally {
      await grantsClient.end({ timeout: 5 });
    }
  }
}

await main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
