import { parseArgs } from 'node:util';
import { resolve } from 'node:path';
import { getAdminDatabaseUrl, redactDatabaseUrl } from './config';
import { createDatabaseBackup } from './pgTools';

async function main() {
  const { values } = parseArgs({
    options: {
      label: { type: 'string' },
      output: { type: 'string' },
    },
    strict: true,
  });

  const connectionString = getAdminDatabaseUrl();
  console.log(`Creating logical backup from ${redactDatabaseUrl(connectionString)}`);

  const outputPath = await createDatabaseBackup({
    connectionString,
    label: values.label,
    outputPath: values.output ? resolve(process.cwd(), values.output) : undefined,
  });

  console.log(`Backup complete: ${outputPath}`);
}

await main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
