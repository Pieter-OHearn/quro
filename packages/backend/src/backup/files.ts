import { createHash, type Hash } from 'node:crypto';
import { open, readdir, rename, rm, stat, type FileHandle } from 'node:fs/promises';
import { join } from 'node:path';
import { isValidDocumentKey } from '../lib/documentStore';
import { syncDirectory } from '../lib/filesystemDocumentStore';
import type { ByteSink } from './tar';

// File helpers for backups: a buffered, hashed writer that creates files readable by their owner
// only, file readers that yield chunks, and the walk over the documents directory.

/** Owner read and write only: archives hold financial records. */
export const ARCHIVE_FILE_MODE = 0o600;
const WRITE_BUFFER_BYTES = 1_048_576;

export const sha256Hex = (hash: Hash) => hash.digest('hex');

/**
 * Writes a new file (never replacing one) through a buffer and hashes the bytes on the way.
 * `close` flushes them to disk.
 */
export class FileSink implements ByteSink {
  private readonly hash = createHash('sha256');
  private buffer = new Uint8Array(WRITE_BUFFER_BYTES);
  private used = 0;
  bytes = 0;

  private constructor(private readonly handle: FileHandle) {}

  static async create(path: string): Promise<FileSink> {
    return new FileSink(await open(path, 'wx', ARCHIVE_FILE_MODE));
  }

  async write(bytes: Uint8Array): Promise<void> {
    this.hash.update(bytes);
    this.bytes += bytes.length;
    if (this.used + bytes.length > this.buffer.length) await this.flush();
    if (bytes.length >= this.buffer.length) {
      await this.handle.write(bytes);
      return;
    }
    this.buffer.set(bytes, this.used);
    this.used += bytes.length;
  }

  private async flush(): Promise<void> {
    if (this.used === 0) return;
    await this.handle.write(this.buffer.subarray(0, this.used));
    // A new buffer: the write may still read the old one.
    this.buffer = new Uint8Array(WRITE_BUFFER_BYTES);
    this.used = 0;
  }

  /** Flushes, syncs and closes; returns the SHA-256 of everything written. */
  async close(): Promise<string> {
    try {
      await this.flush();
      await this.handle.sync();
    } finally {
      await this.handle.close();
    }
    return sha256Hex(this.hash);
  }

  /** Closes without syncing, after a failure. */
  async abandon(): Promise<void> {
    await this.handle.close().catch(() => undefined);
  }
}

/** The file's bytes in chunks. */
export function fileChunks(path: string): AsyncIterable<Uint8Array> {
  return Bun.file(path).stream();
}

/** Hashes chunks as they pass. */
export async function* hashing(
  chunks: AsyncIterable<Uint8Array>,
  hash: Hash,
): AsyncGenerator<Uint8Array> {
  for await (const chunk of chunks) {
    hash.update(chunk);
    yield chunk;
  }
}

export async function sha256OfFile(path: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of fileChunks(path)) hash.update(chunk);
  return sha256Hex(hash);
}

/** Renames a finished file into place, never over an existing file, and makes it durable. */
export async function publishFile(partialPath: string, finalPath: string, directory: string) {
  if (await stat(finalPath).catch(() => null)) {
    throw new Error(`${finalPath} already exists; it was not replaced.`);
  }
  await rename(partialPath, finalPath);
  await syncDirectory(directory);
}

export async function removeQuietly(path: string): Promise<void> {
  await rm(path, { force: true, recursive: true }).catch(() => undefined);
}

export type DocumentListing = {
  /** Keys of the regular files, sorted. */
  keys: string[];
  /** Entries that are not documents the store could have written (hidden, links, odd names). */
  skipped: string[];
};

/**
 * Every document file under the directory, as store keys. Names starting with a dot are the
 * store's own temporary files and staging directories and are left out, as is anything that is
 * not a regular file or not a valid key.
 */
export async function listDocumentFiles(directory: string): Promise<DocumentListing> {
  const listing: DocumentListing = { keys: [], skipped: [] };
  const entries = await readdir(directory, { recursive: true, withFileTypes: true });
  for (const entry of entries) {
    const relative = join(entry.parentPath, entry.name).slice(directory.length + 1);
    if (relative.split('/').some((segment) => segment.startsWith('.'))) continue;
    if (entry.isDirectory()) continue;
    if (entry.isFile() && isValidDocumentKey(relative)) listing.keys.push(relative);
    else listing.skipped.push(relative);
  }
  listing.keys.sort();
  return listing;
}
