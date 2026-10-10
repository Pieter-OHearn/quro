import { describe, expect, test } from 'bun:test';
import { compareAppVersions, parseAppVersion, readAppVersion } from '../lib/appVersion';
import { compareSchema, type BundledMigration } from '../db/migrationState';
import { archiveName, parseArchiveName } from './archiveNames';
import { compareFingerprints } from './fingerprint';
import {
  ArchiveFormatError,
  ArchiveVersionError,
  assertRestorableBy,
  parseManifest,
  type Manifest,
} from './manifest';
import { archivesToDelete } from './retention';

const MIGRATIONS: BundledMigration[] = [
  { index: 0, tag: '0000_first', createdAt: 100 },
  { index: 1, tag: '0001_second', createdAt: 200 },
];

function manifest(overrides: Partial<Manifest> = {}): Manifest {
  return {
    format: 'quro-backup',
    formatVersion: 1,
    createdAt: '2026-10-10T03:15:00.000Z',
    label: null,
    app: { version: 'v0.8.0' },
    database: {
      entry: 'database.dump',
      bytes: 10,
      sha256: 'a'.repeat(64),
      serverVersion: '18.6',
      lastMigration: { tag: '0001_second', createdAt: 200, hash: 'h' },
      appliedMigrations: 2,
      fingerprint: { tables: {}, sequences: {} },
    },
    documents: { driver: 'filesystem', included: true, count: 0, bytes: 0, files: [], missing: [] },
    secrets: { encrypted: false, inArchive: [], notInArchive: [] },
    ...overrides,
  };
}

describe('application versions', () => {
  test('parse release and candidate versions only', () => {
    expect(parseAppVersion('v0.8.0')).toEqual({ major: 0, minor: 8, patch: 0, rc: null });
    expect(parseAppVersion('v1.0.0-rc.2')).toEqual({ major: 1, minor: 0, patch: 0, rc: 2 });
    expect(parseAppVersion('latest')).toBeNull();
    expect(parseAppVersion('v1.0')).toBeNull();
  });

  test('order versions, with a release after its candidates', () => {
    const order = ['v0.7.0', 'v0.8.0', 'v1.0.0-rc.1', 'v1.0.0-rc.2', 'v1.0.0', 'v1.0.1'];
    for (let index = 1; index < order.length; index += 1) {
      const older = parseAppVersion(order[index - 1]!)!;
      const newer = parseAppVersion(order[index]!)!;
      expect(compareAppVersions(newer, older)).toBeGreaterThan(0);
      expect(compareAppVersions(older, newer)).toBeLessThan(0);
      expect(compareAppVersions(newer, newer)).toBe(0);
    }
  });

  test('the repository has a readable VERSION', () => {
    expect(parseAppVersion(readAppVersion() ?? '')).not.toBeNull();
    expect(readAppVersion('/nonexistent/VERSION')).toBeNull();
  });
});

describe('schema state', () => {
  test('compares applied migrations with the bundled journal', () => {
    expect(compareSchema(null, MIGRATIONS)).toEqual({ kind: 'empty' });
    expect(compareSchema([], MIGRATIONS)).toEqual({ kind: 'empty' });
    expect(compareSchema([{ createdAt: 100, hash: 'x' }], MIGRATIONS)).toMatchObject({
      kind: 'behind',
      pending: 1,
      last: { tag: '0000_first' },
    });
    expect(
      compareSchema(
        [
          { createdAt: 100, hash: 'x' },
          { createdAt: 200, hash: 'y' },
        ],
        MIGRATIONS,
      ),
    ).toMatchObject({ kind: 'current', last: { tag: '0001_second' } });
    expect(compareSchema([{ createdAt: 300, hash: 'z' }], MIGRATIONS)).toMatchObject({
      kind: 'ahead',
      last: { tag: null, createdAt: 300 },
    });
  });
});

describe('manifest', () => {
  test('parses what the backup writes', () => {
    const parsed = parseManifest(JSON.stringify(manifest()));
    expect(parsed.database.lastMigration?.tag).toBe('0001_second');
  });

  test('rejects damaged manifests by what is wrong, never by content', () => {
    expect(() => parseManifest('{not json')).toThrow(ArchiveFormatError);
    expect(() => parseManifest(JSON.stringify({ ...manifest(), format: 'other' }))).toThrow(
      'format',
    );
    const noChecksum = manifest();
    (noChecksum.database as { sha256?: string }).sha256 = undefined;
    expect(() => parseManifest(JSON.stringify(noChecksum))).toThrow('database checksum');
    expect(() => parseManifest(JSON.stringify({ ...manifest(), formatVersion: 2 }))).toThrow(
      ArchiveVersionError,
    );
  });

  test('an archive from a newer release is refused, an older one is accepted', () => {
    const image = { version: 'v0.8.0', migrations: MIGRATIONS };
    expect(() => assertRestorableBy(manifest(), image)).not.toThrow();
    expect(() => assertRestorableBy(manifest({ app: { version: 'v0.7.0' } }), image)).not.toThrow();
    expect(() => assertRestorableBy(manifest({ app: { version: 'v0.9.0' } }), image)).toThrow(
      'newer than this image',
    );
    const newerSchema = manifest();
    newerSchema.database.lastMigration = { tag: '0002_third', createdAt: 300, hash: 'z' };
    expect(() => assertRestorableBy(newerSchema, image)).toThrow('does not know (0002_third)');
  });
});

describe('fingerprints', () => {
  test('name every difference without row data', () => {
    const before = {
      tables: {
        'public.users': { rows: 2, checksum: '10' },
        'public.goals': { rows: 1, checksum: '5' },
        'public.debts': { rows: 1, checksum: '7' },
      },
      sequences: { 'public.users_id_seq': '2' },
    };
    const after = {
      tables: {
        'public.users': { rows: 2, checksum: '11' },
        'public.goals': { rows: 0, checksum: '0' },
        'public.extra': { rows: 0, checksum: '0' },
      },
      sequences: { 'public.users_id_seq': '3' },
    };
    expect(compareFingerprints(before, before)).toEqual([]);
    expect(compareFingerprints(before, after)).toEqual([
      'table public.debts is missing',
      'table public.extra is extra',
      'table public.goals: 0 rows instead of 1',
      'table public.users: same row count, different content',
      'sequence public.users_id_seq differs',
    ]);
  });
});

describe('archive names and retention', () => {
  test('names sort by time and carry the label and encryption', () => {
    const name = archiveName(new Date('2026-10-10T03:15:09Z'), null, false);
    expect(name).toBe('quro-backup-20261010-031509Z.tar');
    expect(archiveName(new Date('2026-10-10T03:15:09Z'), 'pre-restore', true)).toBe(
      'quro-backup-20261010-031509Z-pre-restore.tar.enc',
    );
    expect(parseArchiveName('quro-backup-20261010-031509Z-pre-restore.tar.enc')).toEqual({
      stamp: '20261010-031509Z',
      label: 'pre-restore',
      encrypted: true,
    });
    expect(parseArchiveName('quro-20261009-001322.dump')).toBeNull();
    expect(parseArchiveName('.quro-backup-20261010-031509Z.tar.partial')).toBeNull();
  });

  test('keeps the newest unlabelled archives, counting the new one, and nothing else', () => {
    const names = [
      'quro-backup-20261001-030000Z.tar',
      'quro-backup-20261002-030000Z.tar.enc',
      'quro-backup-20261003-030000Z.tar',
      'quro-backup-20261003-120000Z-before-upgrade.tar',
      'quro-backup-20261004-030000Z-pre-restore.tar',
      '.quro-backup-20261005-030000Z.tar.partial',
      'notes.txt',
      'quro-20261009-001322.dump',
      'quro-backup-20261005-030000Z.tar',
    ];
    const current = 'quro-backup-20261005-030000Z.tar';
    expect(archivesToDelete(names, 2, current)).toEqual([
      'quro-backup-20261002-030000Z.tar.enc',
      'quro-backup-20261001-030000Z.tar',
    ]);
    expect(archivesToDelete(names, 1, current)).toEqual([
      'quro-backup-20261003-030000Z.tar',
      'quro-backup-20261002-030000Z.tar.enc',
      'quro-backup-20261001-030000Z.tar',
    ]);
    expect(archivesToDelete(names, 10, current)).toEqual([]);
  });
});
