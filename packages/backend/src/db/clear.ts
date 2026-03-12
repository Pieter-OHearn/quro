import { createQueryClient } from './client';
import { getAdminDatabaseUrl, redactDatabaseUrl } from './config';
import {
  assertConfirmation,
  clearCountPlan,
  CLEAR_TABLE_NAMES,
  getDatabaseSummary,
  logDatabaseSummary,
  quoteIdentifier,
  sumTableCounts,
} from './maintenance';
import { createDatabaseBackup } from './pgTools';

async function main() {
  assertConfirmation('QRO_CLEAR_CONFIRM', 'clear-all-data', 'clear local application data');

  const connectionString = getAdminDatabaseUrl();
  console.log(`Preparing clear against ${redactDatabaseUrl(connectionString)}`);

  const sql = createQueryClient(connectionString, { max: 1 });
  try {
    const summary = await getDatabaseSummary(sql, clearCountPlan);
    logDatabaseSummary(summary, 'Pre-clear summary');

    const existingRows = sumTableCounts(summary.tableCounts);
    if (existingRows > 0 && process.env.QRO_CLEAR_ALLOW_NON_EMPTY !== '1') {
      throw new Error(
        'Refusing to clear a non-empty database. Set QRO_CLEAR_ALLOW_NON_EMPTY=1 after verifying the target database and latest backup.',
      );
    }

    if (existingRows > 0) {
      const backupPath = await createDatabaseBackup({
        connectionString,
        label: 'pre-clear',
      });
      console.log(`Automatic pre-clear backup: ${backupPath}`);
    } else {
      console.log('Database is already empty. No pre-clear backup was needed.');
    }

    const tableList = CLEAR_TABLE_NAMES.map(quoteIdentifier).join(', ');
    await sql.unsafe(`truncate table ${tableList} restart identity cascade`);
    console.log('Local application data cleared. Schema and migrations were preserved.');
  } finally {
    await sql.end({ timeout: 5 });
  }
}

await main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
