import { isNotNull, isNull } from 'drizzle-orm';
import { assertConfig, type S3Connection } from '../config';
import type { DocumentStore } from '../lib/documentStore';
import { DocumentDirectoryError } from '../lib/filesystemDocumentStore';
import {
  migrateDocumentsFromS3,
  type DocumentReference,
  type MigrationReport,
} from '../lib/documentMigration';
import { createS3DocumentStore } from '../lib/s3';
import {
  EXIT_FAILURE,
  EXIT_OK,
  EXIT_UNAVAILABLE,
  EXIT_USAGE,
  UsageError,
  type CommandIo,
} from './io';

// Document storage commands for the instance operator. They print object keys (user and row ids
// with a random name), counts and reasons; never file names, amounts or other household data.

export const DOCUMENTS_USAGE = `Usage: quro documents <command>

Commands:
  migrate-from-s3   Copy every document the database refers to from the S3 store (the S3_*
                    settings) into the documents directory (QRO_DOCUMENTS_DIR), under the same
                    key. Each copy is checked by SHA-256. No database row changes and nothing is
                    deleted from S3. Nothing is added to the documents directory unless every
                    needed document was copied; run it again to continue after a failure or an
                    interruption. Then set QRO_DOCUMENT_STORAGE=filesystem and restart.

In Docker Compose: docker compose exec backend quro documents migrate-from-s3`;

// Imports the worker still has to read, or that the user can still commit. Committed imports are
// read through their pension transaction; the others are never read again.
const IMPORT_STATUSES_STILL_READ = new Set(['queued', 'processing', 'ready_for_review']);

/** Every object key the database refers to, with what the rows recorded about it. */
export async function readDocumentReferences(): Promise<DocumentReference[]> {
  const { db } = await import('../db/client');
  const { payslips, pensionStatementImports, pensionTransactions } = await import('../db/schema');

  const inline = async (
    table: typeof payslips | typeof pensionTransactions,
    name: string,
  ): Promise<DocumentReference[]> => {
    const rows = await db
      .select({
        id: table.id,
        key: table.documentStorageKey,
        size: table.documentSizeBytes,
      })
      .from(table)
      .where(isNotNull(table.documentStorageKey));
    return rows.map((row) => ({
      key: row.key!,
      source: `${name}#${row.id}`,
      needed: true,
      expectedSize: row.size,
      expectedSha256: null,
    }));
  };

  const imports = await db
    .select({
      id: pensionStatementImports.id,
      key: pensionStatementImports.storageKey,
      size: pensionStatementImports.sizeBytes,
      sha256: pensionStatementImports.fileHashSha256,
      status: pensionStatementImports.status,
    })
    .from(pensionStatementImports)
    .where(isNull(pensionStatementImports.storageDeletedAt));

  return [
    ...(await inline(pensionTransactions, 'pension_transactions')),
    ...(await inline(payslips, 'payslips')),
    ...imports.map((row) => ({
      key: row.key,
      source: `pension_statement_imports#${row.id} (${row.status})`,
      needed: IMPORT_STATUSES_STILL_READ.has(row.status),
      expectedSize: row.size,
      expectedSha256: row.sha256,
    })),
  ];
}

export type DocumentsCommandDependencies = {
  createSource: (connection: S3Connection) => DocumentStore;
  readReferences: () => Promise<DocumentReference[]>;
};

const DEFAULT_DEPENDENCIES: DocumentsCommandDependencies = {
  createSource: (connection) => createS3DocumentStore(connection),
  readReferences: readDocumentReferences,
};

function errorName(error: unknown): string {
  if (error && typeof error === 'object') {
    const { name, code } = error as { name?: unknown; code?: unknown };
    if (typeof code === 'string') return code;
    if (typeof name === 'string') return name;
  }
  return 'unknown error';
}

function printReport(report: MigrationReport, directory: string, io: CommandIo): number {
  const summary = `${report.copied.length} copied, ${report.alreadyPresent.length} already present, ${report.skipped.length} skipped`;
  if (report.failures.length > 0) {
    io.err(
      `Stopped: ${report.failures.length} of ${report.objects} documents could not be copied (${summary}).`,
    );
    io.err(`Nothing was added to ${directory}. Verified copies are kept for the next run.`);
    io.err('Keep QRO_DOCUMENT_STORAGE=s3 until a run finishes without failures.');
    return EXIT_FAILURE;
  }
  io.out(`Done: ${report.objects} documents referenced, ${summary}.`);
  if (report.skipped.length > 0) {
    io.out('Skipped documents belong to imports the application no longer reads.');
  }
  io.out(
    `Every needed document is in ${directory}. Set QRO_DOCUMENT_STORAGE=filesystem and restart the backend and the import worker.`,
  );
  io.out(
    'The objects in S3 were not changed; remove the S3 store only when you no longer need it.',
  );
  return EXIT_OK;
}

async function migrateFromS3(
  args: readonly string[],
  io: CommandIo,
  dependencies: DocumentsCommandDependencies,
): Promise<number> {
  if (args.length > 0) throw new UsageError(`Unexpected argument: ${args[0]}`);
  const config = assertConfig('documentsMigration');
  const { directory } = config.documentStorage;
  if (!config.s3.enabled) {
    io.err(
      'The S3 store to copy from is not configured: set S3_ENDPOINT, S3_REGION, S3_BUCKET, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY_FILE.',
    );
    return EXIT_USAGE;
  }

  const source = dependencies.createSource(config.s3);
  try {
    await source.check();
  } catch (error) {
    io.err(`The S3 store cannot be reached (${errorName(error)}). Nothing was copied.`);
    return EXIT_UNAVAILABLE;
  }

  let references: DocumentReference[];
  try {
    references = await dependencies.readReferences();
  } catch (error) {
    io.err(`Document references could not be read from the database (${errorName(error)}).`);
    return EXIT_UNAVAILABLE;
  }

  io.out(`Copying documents from S3 bucket ${config.s3.bucket} into ${directory}.`);
  try {
    const report = await migrateDocumentsFromS3({
      references,
      source,
      directory,
      log: (line) => io.out(line),
    });
    return printReport(report, directory, io);
  } catch (error) {
    if (!(error instanceof DocumentDirectoryError)) throw error;
    io.err(`${error.message} (${directory}) Nothing was copied.`);
    return EXIT_FAILURE;
  }
}

export async function runDocumentsCommand(
  args: readonly string[],
  io: CommandIo,
  dependencies: DocumentsCommandDependencies = DEFAULT_DEPENDENCIES,
): Promise<number> {
  const [command, ...rest] = args;
  if (command === undefined || command === '--help' || command === 'help') {
    (command === undefined ? io.err : io.out)(DOCUMENTS_USAGE);
    return command === undefined ? EXIT_USAGE : EXIT_OK;
  }
  if (command === 'migrate-from-s3') return await migrateFromS3(rest, io, dependencies);
  throw new UsageError(`Unknown documents command: ${command}`);
}
