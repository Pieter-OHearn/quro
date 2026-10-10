import { createHash } from 'node:crypto';
import { open, stat } from 'node:fs/promises';
import type { Secret } from '../config';
import { isValidDocumentKey } from '../lib/documentStore';
import { ArchiveDecryptionError, decryptFile, isEncryptedHeader } from './encryption';
import { fileChunks, hashing, sha256Hex } from './files';
import {
  ArchiveFormatError,
  DATABASE_ENTRY,
  DOCUMENTS_PREFIX,
  MANIFEST_ENTRY,
  parseManifest,
  type DocumentFile,
  type Manifest,
} from './manifest';
import { summarizeProblems } from './problems';
import { readTar, TarFormatError } from './tar';

// Reads a whole archive, decrypting it when needed, and checks every entry against the manifest:
// the dump's and every document's SHA-256 and size, nothing missing, nothing extra. Restore runs
// the same scan with handlers that write the entries to a staging area, so what it restores is
// exactly what was checked.

// 256 MiB: a manifest lists every document with its checksum, far below this.
const MAX_MANIFEST_BYTES = 268_435_456;
const MAGIC_PROBE_BYTES = 8;
// The first bytes of a pg_dump custom-format file.
const PG_DUMP_MAGIC = 'PGDMP';

export class ArchiveNotFoundError extends Error {
  constructor(path: string) {
    super(`No archive at ${path}.`);
    this.name = 'ArchiveNotFoundError';
  }
}

export class ArchiveKeyMissingError extends Error {
  constructor() {
    super(
      'The archive is encrypted. Set QRO_BACKUP_ENCRYPTION_KEY_FILE to the file holding the key it was written with.',
    );
    this.name = 'ArchiveKeyMissingError';
  }
}

/** The archive's content does not match its manifest. */
export class ArchiveIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ArchiveIntegrityError';
  }
}

export type ScanHandlers = {
  /** Receives the dump's bytes, for example to write them to a file. */
  dump?: (chunks: AsyncIterable<Uint8Array>) => Promise<void>;
  /** Receives a document's bytes under its key. */
  document?: (key: string, chunks: AsyncIterable<Uint8Array>) => Promise<void>;
};

export type VerifiedArchive = { manifest: Manifest; encrypted: boolean; bytes: number };

type Seen = {
  manifest: Uint8Array | null;
  dump: { bytes: number; sha256: string } | null;
  documents: Map<string, { bytes: number; sha256: string }>;
};

async function readFirstBytes(path: string): Promise<{ bytes: number; head: Uint8Array }> {
  const info = await stat(path).catch(() => null);
  if (!info?.isFile()) throw new ArchiveNotFoundError(path);
  const handle = await open(path, 'r');
  try {
    const head = new Uint8Array(MAGIC_PROBE_BYTES);
    const { bytesRead } = await handle.read(head, 0, MAGIC_PROBE_BYTES, 0);
    return { bytes: info.size, head: head.subarray(0, bytesRead) };
  } finally {
    await handle.close();
  }
}

async function collect(chunks: AsyncIterable<Uint8Array>, limit: number): Promise<Uint8Array> {
  const parts: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of chunks) {
    size += chunk.length;
    if (size > limit) throw new ArchiveFormatError('The archive manifest is too large.');
    parts.push(chunk);
  }
  return Buffer.concat(parts);
}

/** Hashes an entry while passing it to `consume` (or just reading it). */
async function digest(
  chunks: AsyncIterable<Uint8Array>,
  consume?: (chunks: AsyncIterable<Uint8Array>) => Promise<void>,
): Promise<{ bytes: number; sha256: string }> {
  const hash = createHash('sha256');
  let bytes = 0;
  const counted = (async function* () {
    for await (const chunk of hashing(chunks, hash)) {
      bytes += chunk.length;
      yield chunk;
    }
  })();
  if (consume) await consume(counted);
  for await (const chunk of counted) void chunk;
  return { bytes, sha256: sha256Hex(hash) };
}

function entryHandler(seen: Seen, handlers: ScanHandlers) {
  return async (entry: { path: string }, body: AsyncIterable<Uint8Array>) => {
    if (seen.manifest) throw new ArchiveFormatError('The archive has entries after its manifest.');
    if (entry.path === MANIFEST_ENTRY) {
      seen.manifest = await collect(body, MAX_MANIFEST_BYTES);
    } else if (entry.path === DATABASE_ENTRY) {
      if (seen.dump) throw new ArchiveFormatError('The archive holds two database dumps.');
      seen.dump = await digest(body, handlers.dump);
    } else if (entry.path.startsWith(DOCUMENTS_PREFIX)) {
      const key = entry.path.slice(DOCUMENTS_PREFIX.length);
      if (!isValidDocumentKey(key) || seen.documents.has(key)) {
        throw new ArchiveFormatError('The archive holds a document entry with an invalid name.');
      }
      const onDocument = handlers.document;
      seen.documents.set(key, await digest(body, onDocument && ((c) => onDocument(key, c))));
    } else {
      throw new ArchiveFormatError('The archive holds an entry Quro does not write.');
    }
  };
}

function compareDocuments(expected: readonly DocumentFile[], actual: Seen['documents']): void {
  const problems: string[] = [];
  for (const file of expected) {
    const found = actual.get(file.key);
    if (!found) problems.push(`${file.key} is missing`);
    else if (found.sha256 !== file.sha256 || found.bytes !== file.bytes) {
      problems.push(`${file.key} has a different checksum`);
    }
  }
  const listed = new Set(expected.map((file) => file.key));
  for (const key of actual.keys()) if (!listed.has(key)) problems.push(`${key} is not listed`);
  if (problems.length > 0) {
    throw new ArchiveIntegrityError(
      `Documents do not match the manifest: ${summarizeProblems(problems)}.`,
    );
  }
}

function checkAgainstManifest(seen: Seen): Manifest {
  if (!seen.manifest)
    throw new ArchiveFormatError('The archive has no manifest; it is incomplete.');
  const manifest = parseManifest(new TextDecoder().decode(seen.manifest));
  const { database, documents } = manifest;
  if (!seen.dump) throw new ArchiveIntegrityError('The archive has no database dump.');
  if (seen.dump.sha256 !== database.sha256 || seen.dump.bytes !== database.bytes) {
    throw new ArchiveIntegrityError('The database dump does not match its checksum.');
  }
  if (documents.included) compareDocuments(documents.files, seen.documents);
  else if (seen.documents.size > 0) {
    throw new ArchiveIntegrityError('The archive holds documents its manifest does not list.');
  }
  return manifest;
}

const UNREADABLE_ENCRYPTED =
  'The archive could not be decrypted: the key is not the one it was encrypted with, or the archive is damaged.';

/** The archive's content stream: decrypted when it is encrypted. */
function openArchive(path: string, head: Uint8Array, key: Secret | null) {
  if (new TextDecoder().decode(head).startsWith(PG_DUMP_MAGIC)) {
    throw new ArchiveFormatError(
      'The file is a bare PostgreSQL dump, not a Quro backup archive. See "Restore a database dump" in docs/backup-and-restore.md.',
    );
  }
  if (!isEncryptedHeader(head)) return fileChunks(path);
  if (!key) throw new ArchiveKeyMissingError();
  return decryptFile(path, key);
}

/**
 * Reads and checks the whole archive. Errors: `ArchiveNotFoundError`, `ArchiveKeyMissingError`,
 * `ArchiveDecryptionError` (wrong key or damaged encrypted archive), `TarFormatError` and
 * `ArchiveFormatError` (damaged or not an archive), `ArchiveIntegrityError` (checksum mismatch),
 * `ArchiveVersionError` (a newer backup format).
 */
export async function scanArchive(
  path: string,
  key: Secret | null,
  handlers: ScanHandlers = {},
): Promise<VerifiedArchive> {
  const { bytes, head } = await readFirstBytes(path);
  const encrypted = isEncryptedHeader(head);
  const chunks = openArchive(path, head, key);
  const seen: Seen = { manifest: null, dump: null, documents: new Map() };
  try {
    await readTar(chunks, entryHandler(seen, handlers));
  } catch (error) {
    // Encrypted content that does not parse failed authentication: say so, not "damaged tar".
    const unreadable = error instanceof TarFormatError || error instanceof ArchiveFormatError;
    if (encrypted && unreadable) throw new ArchiveDecryptionError(UNREADABLE_ENCRYPTED);
    throw error;
  }
  return { manifest: checkAgainstManifest(seen), encrypted, bytes };
}
