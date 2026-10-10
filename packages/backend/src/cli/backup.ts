import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { assertConfig, type Config } from '../config';
import { LABEL_PATTERN, partialName } from '../backup/archiveNames';
import {
  assertWritableDirectory,
  defaultBackupDependencies,
  writeBackupArchive,
  type BackupDependencies,
  type WrittenArchive,
} from '../backup/createBackup';
import { FileSink, fileChunks, publishFile, removeQuietly, sha256OfFile } from '../backup/files';
import { totalRows } from '../backup/fingerprint';
import type { Manifest } from '../backup/manifest';
import { firstFew } from '../backup/problems';
import { applyRetention } from '../backup/retention';
import { scanArchive } from '../backup/verifyArchive';
import { archiveErrorMessage, archiveExitCode } from './archiveErrors';
import { EXIT_FAILURE, EXIT_OK, EXIT_USAGE, UsageError, type CommandIo } from './io';

export const BACKUP_USAGE = `Usage: quro backup [--output <dir>] [--label <name>] [--wait <seconds>]
       quro backup verify <archive>

Writes one archive into QRO_BACKUP_DIR: the database, the documents (filesystem storage) or the
list of documents the database refers to (S3 storage), and a manifest with versions and
checksums. While the database and the documents are copied, changes are paused: the server
answers them with 503 and background jobs wait. The archive is read back and checked before it
is kept. Settings files and secret files are never in an archive; keep a copy of them elsewhere.

Options:
  --output <dir>     Write into this directory instead of QRO_BACKUP_DIR.
  --label <name>     Add a label to the file name (lowercase letters, digits and dashes).
                     Retention never deletes labelled archives.
  --wait <seconds>   How long to wait for running changes and jobs to finish (default 600).

QRO_BACKUP_ENCRYPTION_KEY_FILE encrypts the archive, QRO_BACKUP_OFFSITE_DIR receives a checked
copy, and QRO_BACKUP_KEEP deletes older unlabelled archives once the new one is checked.

  verify <archive>   Read a whole archive and check it against its manifest. Needs the key for
                     an encrypted archive, and no database.

In Docker Compose: see docs/backup-and-restore.md.`;

const DEFAULT_WAIT_SECONDS = 600;
const MAX_WAIT_SECONDS = 86_400;
const KIBIBYTE = 1024;
const MEBIBYTE = KIBIBYTE * KIBIBYTE;

type BackupOptions = { output: string | null; label: string | null; waitSeconds: number };

function parseWait(raw: string | undefined): number {
  if (raw === undefined) return DEFAULT_WAIT_SECONDS;
  const value = /^\d+$/.test(raw) ? Number(raw) : Number.NaN;
  if (!Number.isSafeInteger(value) || value > MAX_WAIT_SECONDS) {
    throw new UsageError(`--wait must be a whole number of seconds up to ${MAX_WAIT_SECONDS}`);
  }
  return value;
}

function parseBackupOptions(args: readonly string[]): BackupOptions {
  let values: { output?: string; label?: string; wait?: string };
  try {
    ({ values } = parseArgs({
      args: [...args],
      options: {
        output: { type: 'string' },
        label: { type: 'string' },
        wait: { type: 'string' },
      },
      strict: true,
      allowPositionals: false,
    }));
  } catch (error) {
    throw new UsageError(error instanceof Error ? error.message : String(error));
  }
  if (values.label !== undefined && !LABEL_PATTERN.test(values.label)) {
    throw new UsageError(
      '--label may hold lowercase letters, digits and dashes (up to 40, starting with a letter or digit)',
    );
  }
  return {
    output: values.output ? resolve(process.cwd(), values.output) : null,
    label: values.label ?? null,
    waitSeconds: parseWait(values.wait),
  };
}

const megabytes = (bytes: number) => `${(bytes / MEBIBYTE).toFixed(1)} MiB`;

function describeManifest(manifest: Manifest): string[] {
  const { database, documents } = manifest;
  const migration = database.lastMigration?.tag ?? 'none';
  const lines = [
    `Taken ${manifest.createdAt} by Quro ${manifest.app.version ?? '(unknown version)'}${manifest.label ? `, label ${manifest.label}` : ''}`,
    `Database: PostgreSQL ${database.serverVersion}, ${Object.keys(database.fingerprint.tables).length} tables, ${totalRows(database.fingerprint)} rows, last migration ${migration}`,
  ];
  if (documents.included) {
    lines.push(`Documents: ${documents.count} (${megabytes(documents.bytes)}), checked by SHA-256`);
    if (documents.missing.length > 0) {
      lines.push(
        `Warning: ${documents.missing.length} document(s) the database refers to were not in the documents directory: ${firstFew(documents.missing)}`,
      );
    }
  } else {
    lines.push(
      `Documents: not included (S3 storage). ${documents.referenced.length} object(s) are listed in the manifest; copy the bucket with your store tools.`,
    );
  }
  lines.push(
    manifest.secrets.encrypted
      ? 'Encrypted. Keep the key file elsewhere: without it this archive cannot be restored.'
      : 'Not encrypted. It holds financial records and bank-link tokens: store it like the live data.',
  );
  return lines;
}

/** Copies the archive to the off-device directory and reads the copy back before keeping it. */
async function copyOffsite(archive: WrittenArchive, directory: string): Promise<string> {
  await assertWritableDirectory(directory, 'off-device backup directory (QRO_BACKUP_OFFSITE_DIR)');
  const partial = resolve(directory, partialName(archive.name));
  const final = resolve(directory, archive.name);
  try {
    const sink = await FileSink.create(partial);
    try {
      for await (const chunk of fileChunks(archive.path)) await sink.write(chunk);
    } finally {
      await sink.close();
    }
    if ((await sha256OfFile(partial)) !== archive.sha256) {
      throw new Error(`The copy in ${directory} does not match the archive; it was not kept.`);
    }
    await publishFile(partial, final, directory);
    return final;
  } catch (error) {
    await removeQuietly(partial);
    throw error;
  }
}

async function runRetention(
  config: Config['backup'],
  directories: string[],
  archive: WrittenArchive,
  io: CommandIo,
): Promise<void> {
  if (config.keep === null) return;
  for (const directory of directories) {
    const deleted = await applyRetention(directory, config.keep, archive.name);
    for (const name of deleted) io.out(`Deleted older archive ${resolve(directory, name)}`);
  }
}

/**
 * Runs `work` with an abort signal that SIGINT and SIGTERM trigger, so temporary files are
 * removed. A second signal exits at once.
 */
export async function withInterruption<T>(work: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const abort = () => {
    if (controller.signal.aborted) process.exit(EXIT_FAILURE);
    controller.abort();
  };
  process.on('SIGINT', abort);
  process.on('SIGTERM', abort);
  try {
    return await work(controller.signal);
  } finally {
    process.off('SIGINT', abort);
    process.off('SIGTERM', abort);
  }
}

async function backUp(
  options: BackupOptions,
  io: CommandIo,
  dependencies: BackupDependencies,
): Promise<number> {
  const config = assertConfig('backup');
  const directory = options.output ?? config.backup.directory;
  const archive = await withInterruption((signal) =>
    writeBackupArchive(
      {
        adminUrl: config.adminDatabase.url.reveal(),
        documentStorage: config.documentStorage,
        encryptionKey: config.backup.encryptionKey,
        directory,
        label: options.label,
        waitSeconds: options.waitSeconds,
        maintenanceHeld: false,
        log: (line) => io.out(line),
        signal,
      },
      dependencies,
    ),
  );
  io.out(`Archive written and verified: ${archive.path} (${megabytes(archive.bytes)})`);
  for (const line of describeManifest(archive.manifest)) io.out(line);
  const directories = [directory];
  const { offsiteDirectory } = config.backup;
  if (offsiteDirectory) {
    io.out(`Copied to ${await copyOffsite(archive, offsiteDirectory)} and checked`);
    directories.push(offsiteDirectory);
  }
  // Only labelled archives are kept regardless; retention runs after every check has passed.
  if (!options.label) await runRetention(config.backup, directories, archive, io);
  return EXIT_OK;
}

async function verify(args: readonly string[], io: CommandIo): Promise<number> {
  if (args.length !== 1) throw new UsageError('quro backup verify takes the path of one archive');
  const config = assertConfig('backupVerify');
  const path = resolve(process.cwd(), args[0]!);
  const { manifest, encrypted, bytes } = await scanArchive(path, config.backup.encryptionKey);
  io.out(
    `${path}: complete, every checksum matches (${megabytes(bytes)}${encrypted ? ', encrypted' : ''})`,
  );
  for (const line of describeManifest(manifest)) io.out(line);
  return EXIT_OK;
}

export async function runBackupCommand(
  args: readonly string[],
  io: CommandIo,
  dependencies: BackupDependencies = defaultBackupDependencies(),
): Promise<number> {
  if (args[0] === '--help' || args[0] === 'help') {
    io.out(BACKUP_USAGE);
    return EXIT_OK;
  }
  try {
    if (args[0] === 'verify') return await verify(args.slice(1), io);
    return await backUp(parseBackupOptions(args), io, dependencies);
  } catch (error) {
    if (error instanceof UsageError) throw error;
    if ((error as { name?: unknown } | null)?.name === 'AbortError') {
      io.err('Interrupted. Nothing was kept, and changes are no longer paused.');
      return EXIT_FAILURE;
    }
    io.err(archiveErrorMessage(error));
    const code = archiveExitCode(error);
    if (code === EXIT_USAGE) io.err('Nothing was written.');
    return code;
  }
}
