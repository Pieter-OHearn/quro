import { compareAppVersions, parseAppVersion } from '../lib/appVersion';
import type { BundledMigration } from '../db/schemaVersion';
import type { DatabaseFingerprint } from './fingerprint';

// The manifest is the last entry of every archive (`manifest.json`). It names what the archive
// holds, with a SHA-256 for every entry, the versions it was taken with, a fingerprint of every
// table (row count and checksum, no row data) and what the archive deliberately leaves out. It
// contains no financial data and no secret.

export const ARCHIVE_FORMAT = 'quro-backup';
export const ARCHIVE_FORMAT_VERSION = 1;
export const MANIFEST_ENTRY = 'manifest.json';
export const DATABASE_ENTRY = 'database.dump';
export const DOCUMENTS_PREFIX = 'documents/';

export type DocumentFile = { key: string; bytes: number; sha256: string };

/** The newest migration the database had applied: its `when`, and its tag when the image knows it. */
export type MigrationPoint = { tag: string | null; when: number };

/** A document the database refers to, with what its row recorded (S3 manifests). */
export type ReferencedDocument = {
  key: string;
  source: string;
  bytes: number | null;
  sha256: string | null;
};

export type DocumentsSection =
  | {
      driver: 'filesystem';
      included: true;
      count: number;
      bytes: number;
      files: DocumentFile[];
      /** Keys the database refers to that were not in the documents directory. */
      missing: string[];
    }
  | {
      driver: 's3';
      included: false;
      note: string;
      referenced: ReferencedDocument[];
    };

export type Manifest = {
  format: typeof ARCHIVE_FORMAT;
  formatVersion: number;
  createdAt: string;
  label: string | null;
  /** The release and the image revision (commit) that wrote the archive, when known. */
  app: { version: string | null; revision: string | null };
  database: {
    entry: typeof DATABASE_ENTRY;
    bytes: number;
    sha256: string;
    serverVersion: string;
    lastMigration: MigrationPoint | null;
    fingerprint: DatabaseFingerprint;
  };
  documents: DocumentsSection;
  secrets: {
    encrypted: boolean;
    /** What the database dump holds that must be protected like a password. */
    inArchive: string[];
    /** What a restore needs that is never in an archive. */
    notInArchive: string[];
  };
};

export const SECRETS_IN_ARCHIVE = [
  'password hashes (bcrypt)',
  'digests of session tokens and operator codes, which cannot be used as a cookie or a code',
  'bank-link tokens and keys of connected bunq accounts (table bunq_connections)',
];

export const SECRETS_NOT_IN_ARCHIVE = [
  'the settings file',
  'the database passwords (POSTGRES_ADMIN_PASSWORD_FILE, POSTGRES_APP_PASSWORD_FILE)',
  'the S3 secret access key, with S3 storage',
  'the bunq client id and secret',
  'the backup encryption key (QRO_BACKUP_ENCRYPTION_KEY_FILE)',
];

export class ArchiveFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ArchiveFormatError';
  }
}

/** An archive the running image must not restore: it was written by a newer release. */
export class ArchiveVersionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ArchiveVersionError';
  }
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function requireShape(condition: boolean, what: string): asserts condition {
  if (!condition) throw new ArchiveFormatError(`The archive manifest is damaged (${what}).`);
}

function checkDocuments(documents: unknown): void {
  requireShape(isObject(documents), 'documents');
  if (documents.driver === 'filesystem') {
    requireShape(documents.included === true && Array.isArray(documents.files), 'documents');
    requireShape(Array.isArray(documents.missing), 'documents.missing');
    for (const file of documents.files as unknown[]) {
      requireShape(
        isObject(file) &&
          typeof file.key === 'string' &&
          typeof file.sha256 === 'string' &&
          Number.isSafeInteger(file.bytes),
        'documents.files',
      );
    }
    return;
  }
  requireShape(documents.driver === 's3' && documents.included === false, 'documents.driver');
  requireShape(Array.isArray(documents.referenced), 'documents.referenced');
}

/** Parses and checks the shape of `manifest.json`. */
export function parseManifest(text: string): Manifest {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new ArchiveFormatError('The archive manifest is not valid JSON.');
  }
  requireShape(isObject(value) && value.format === ARCHIVE_FORMAT, 'format');
  requireShape(typeof value.formatVersion === 'number', 'formatVersion');
  if (value.formatVersion > ARCHIVE_FORMAT_VERSION) {
    throw new ArchiveVersionError(
      `The archive uses backup format ${value.formatVersion}; this release reads format ${ARCHIVE_FORMAT_VERSION} and older. Restore it with the release that wrote it or a newer one.`,
    );
  }
  requireShape(typeof value.createdAt === 'string', 'createdAt');
  requireShape(isObject(value.app), 'app');
  const { database } = value;
  requireShape(isObject(database) && database.entry === DATABASE_ENTRY, 'database');
  requireShape(
    typeof database.sha256 === 'string' && Number.isSafeInteger(database.bytes),
    'database checksum',
  );
  requireShape(isObject(database.fingerprint), 'database.fingerprint');
  checkDocuments(value.documents);
  requireShape(isObject(value.secrets), 'secrets');
  return value as unknown as Manifest;
}

/**
 * Refuses an archive written by a newer release: a newer application version, or a last
 * migration this build does not bundle. Older archives restore and are then migrated forward.
 */
export function assertRestorableBy(
  manifest: Manifest,
  image: { version: string | null; migrations: readonly BundledMigration[] },
): void {
  const archiveVersion = manifest.app.version ? parseAppVersion(manifest.app.version) : null;
  const imageVersion = image.version ? parseAppVersion(image.version) : null;
  if (archiveVersion && imageVersion && compareAppVersions(archiveVersion, imageVersion) > 0) {
    throw new ArchiveVersionError(
      `The archive was written by Quro ${manifest.app.version}, which is newer than this image (${image.version}). Restore it with ${manifest.app.version} or later.`,
    );
  }
  const last = manifest.database.lastMigration;
  if (last && !image.migrations.some((migration) => migration.when === last.when)) {
    throw new ArchiveVersionError(
      `The archive's database has a migration this image does not know (${last.tag ?? `created ${last.when}`}): it was written by a newer release. Restore it with the release that wrote it or a newer one.`,
    );
  }
}
