import type { DocumentStorageDriver } from '../config';

// The contract both document storage drivers implement (filesystemDocumentStore.ts, s3.ts). Keys
// are relative paths such as `users/<id>/salary/payslips/<id>/<uuid>.pdf`; they are the same in
// every driver, so `quro documents migrate-from-s3` copies an object without renaming it.

export type ObjectDeletionResult = {
  deletedKeys: string[];
  failedKeys: string[];
};

export type DocumentStore = {
  readonly driver: DocumentStorageDriver;
  /** Stores the bytes under the key, replacing an object with the same key. */
  put(key: string, body: Uint8Array): Promise<void>;
  /** The stored bytes, or null when nothing is stored under the key. */
  get(key: string): Promise<Buffer | null>;
  /** Removes the object. Removing a key that holds nothing is not an error. */
  delete(key: string): Promise<void>;
  /** Removes several objects and reports the keys that could not be removed, for a retry. */
  deleteMany(keys: readonly string[]): Promise<ObjectDeletionResult>;
  /** Resolves when the store can be used, rejects otherwise. Changes nothing. */
  check(): Promise<void>;
};

/** A key that does not name a file inside the store. The application never builds one. */
export class InvalidDocumentKeyError extends Error {
  constructor() {
    super('Invalid document storage key');
    this.name = 'InvalidDocumentKeyError';
  }
}

// One path segment: letters, digits, `_`, `-` and `.`, not starting with a dot. That rules out
// `.` and `..`, separators, NUL and hidden names, which the filesystem driver keeps for its own
// temporary files.
const KEY_SEGMENT = /^[A-Za-z0-9_-][A-Za-z0-9._-]{0,254}$/;
const MAX_KEY_LENGTH = 1024;

/** The key's path segments; throws `InvalidDocumentKeyError` for a key that is not safe. */
export function documentKeySegments(key: string): string[] {
  const segments = key.split('/');
  if (key.length > MAX_KEY_LENGTH || !segments.every((segment) => KEY_SEGMENT.test(segment))) {
    throw new InvalidDocumentKeyError();
  }
  return segments;
}

export function isValidDocumentKey(key: string): boolean {
  try {
    documentKeySegments(key);
    return true;
  } catch {
    return false;
  }
}
