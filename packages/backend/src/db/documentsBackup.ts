import { open, rename, rm, stat } from 'node:fs/promises';

// With the filesystem document store, a backup is the database dump plus a tar archive of the
// documents directory written next to it. Take the dump first: an upload stores its file before
// it inserts the row, so every document a dumped row refers to is already on disk.

const DUMP_EXTENSION = '.dump';
const ARCHIVE_SUFFIX = '.documents.tar';
/** Owner read and write only: the archive holds financial documents. */
const ARCHIVE_MODE = 0o600;

/** `quro-20261009-001322.dump` → `quro-20261009-001322.documents.tar`. */
export function documentsArchivePath(dumpPath: string): string {
  const base = dumpPath.endsWith(DUMP_EXTENSION)
    ? dumpPath.slice(0, -DUMP_EXTENSION.length)
    : dumpPath;
  return `${base}${ARCHIVE_SUFFIX}`;
}

export class DocumentsBackupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DocumentsBackupError';
  }
}

/**
 * Archives the directory with the system `tar`, under a temporary name that is renamed once the
 * archive is complete. The archive is readable by its owner only: it holds financial documents.
 */
export async function archiveDocumentsDirectory(
  directory: string,
  archivePath: string,
  tar: string | null = Bun.which('tar'),
): Promise<void> {
  const info = await stat(directory).catch(() => null);
  if (!info?.isDirectory()) {
    throw new DocumentsBackupError(`The documents directory ${directory} does not exist.`);
  }
  if (!tar)
    throw new DocumentsBackupError('tar is not installed, so documents cannot be archived.');

  const partialPath = `${archivePath}.partial`;
  // Created first so the archive never exists with wider permissions, even while it is written.
  await rm(partialPath, { force: true });
  await (await open(partialPath, 'wx', ARCHIVE_MODE)).close();
  try {
    const processHandle = Bun.spawn([tar, '-cf', partialPath, '-C', directory, '.'], {
      stdin: 'ignore',
      stdout: 'inherit',
      stderr: 'inherit',
    });
    const exitCode = await processHandle.exited;
    if (exitCode !== 0) throw new DocumentsBackupError(`tar exited with status ${exitCode}.`);
    await rename(partialPath, archivePath);
  } catch (error) {
    await rm(partialPath, { force: true });
    throw error;
  }
}
