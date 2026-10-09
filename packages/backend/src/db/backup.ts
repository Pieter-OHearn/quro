import { parseArgs } from 'node:util';
import { resolve } from 'node:path';
import { bootConfig } from '../config';
import { getAdminDatabaseUrl, redactDatabaseUrl } from './config';
import { archiveDocumentsDirectory, documentsArchivePath } from './documentsBackup';
import { createDatabaseBackup } from './pgTools';

async function main() {
  const { documentStorage } = bootConfig('backup');
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

  console.log(`Database backup complete: ${outputPath}`);

  if (documentStorage.driver === 's3') {
    console.log(
      'Documents are kept in the S3 store (QRO_DOCUMENT_STORAGE=s3) and are not part of this backup. Copy the bucket with your S3 tools; see docs/backup-and-restore.md.',
    );
    return;
  }

  // Dump first, then documents: an upload stores its file before it inserts the row.
  const archivePath = documentsArchivePath(outputPath);
  console.log(`Archiving documents from ${documentStorage.directory}`);
  try {
    await archiveDocumentsDirectory(documentStorage.directory, archivePath);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(
      `The database backup was written, but this backup does not contain the documents. ${reason}`,
      { cause: error },
    );
  }
  console.log(`Documents backup complete: ${archivePath}`);
}

await main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
