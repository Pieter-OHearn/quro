import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { access, mkdir, open, readFile, rename, rm, stat, unlink } from 'node:fs/promises';
import { basename, dirname, join, resolve, sep } from 'node:path';
import {
  documentKeySegments,
  InvalidDocumentKeyError,
  type DocumentStore,
  type ObjectDeletionResult,
} from './documentStore';

// The default document store: one file per object under QRO_DOCUMENTS_DIR, at the object's key.
// Files are written under a temporary name, flushed and renamed, so a reader never sees a partial
// document. The directory itself is never created here: a missing directory usually means a
// missing volume, and writing into the container's own filesystem would lose documents on the
// next restart.

const FILE_MODE = 0o600;
const DIRECTORY_MODE = 0o700;

export class DocumentDirectoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DocumentDirectoryError';
  }
}

function errorCode(error: unknown): string | undefined {
  return (error as NodeJS.ErrnoException | null)?.code;
}

/** Nothing is stored at the path, or a parent is a file rather than a directory. */
export function isMissingPathError(error: unknown): boolean {
  const code = errorCode(error);
  return code === 'ENOENT' || code === 'ENOTDIR';
}

/** The file for a key, inside the root. Throws `InvalidDocumentKeyError` for an unsafe key. */
export function resolveDocumentPath(root: string, key: string): string {
  const base = resolve(root);
  const path = join(base, ...documentKeySegments(key));
  // The segment check already rules out traversal; this keeps the guarantee local.
  if (!path.startsWith(`${base}${sep}`)) throw new InvalidDocumentKeyError();
  return path;
}

export async function syncDirectory(path: string): Promise<void> {
  // Makes a rename durable. Some filesystems cannot open or flush a directory; the file itself is
  // already flushed, so that is not an error.
  const handle = await open(path, 'r').catch(() => null);
  try {
    await handle?.sync();
  } catch {
    // See above.
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

/** Writes the file under a temporary name in the same directory, flushes it and renames it. */
export async function writeFileAtomically(path: string, bytes: Uint8Array): Promise<void> {
  const temporary = join(dirname(path), `.${basename(path)}.${randomUUID()}.tmp`);
  const handle = await open(temporary, 'wx', FILE_MODE);
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } catch (error) {
    await handle.close().catch(() => undefined);
    await rm(temporary, { force: true });
    throw error;
  }
  await handle.close();
  try {
    await rename(temporary, path);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
  await syncDirectory(dirname(path));
}

/** Rejects unless the root is an existing directory this process can read and write. */
export async function assertUsableDirectory(root: string): Promise<void> {
  let isDirectory: boolean;
  try {
    isDirectory = (await stat(root)).isDirectory();
  } catch (error) {
    if (isMissingPathError(error)) {
      throw new DocumentDirectoryError('The documents directory does not exist.');
    }
    throw error;
  }
  if (!isDirectory) throw new DocumentDirectoryError('The documents path is not a directory.');
  try {
    await access(root, constants.R_OK | constants.W_OK | constants.X_OK);
  } catch {
    throw new DocumentDirectoryError('The documents directory is not readable and writable.');
  }
}

export async function ensureParentDirectory(root: string, path: string): Promise<void> {
  await assertUsableDirectory(root);
  await mkdir(dirname(path), { recursive: true, mode: DIRECTORY_MODE });
}

export function createFilesystemDocumentStore(directory: string): DocumentStore {
  const root = resolve(directory);
  const pathFor = (key: string) => resolveDocumentPath(root, key);

  async function remove(key: string): Promise<void> {
    try {
      await unlink(pathFor(key));
    } catch (error) {
      if (!isMissingPathError(error)) throw error;
    }
  }

  return {
    driver: 'filesystem',

    async put(key, body) {
      const path = pathFor(key);
      await ensureParentDirectory(root, path);
      await writeFileAtomically(path, body);
    },

    async get(key) {
      try {
        return await readFile(pathFor(key));
      } catch (error) {
        if (isMissingPathError(error)) return null;
        throw error;
      }
    },

    delete: remove,

    async deleteMany(keys): Promise<ObjectDeletionResult> {
      const deletedKeys: string[] = [];
      const failedKeys: string[] = [];
      for (const key of new Set(keys)) {
        try {
          await remove(key);
          deletedKeys.push(key);
        } catch (error) {
          console.error('Failed to delete a stored document; keeping its key for a retry', {
            code: errorCode(error) ?? (error instanceof Error ? error.name : 'unknown'),
          });
          failedKeys.push(key);
        }
      }
      return { deletedKeys, failedKeys };
    },

    check: () => assertUsableDirectory(root),
  };
}
