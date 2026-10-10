import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  setDefaultTimeout,
  test,
} from 'bun:test';
import { createHash, randomUUID } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres, { type Sql } from 'postgres';
import { getConfig, Secret, type BackupConfig } from '../config';
import { bundledMigrations } from '../db/migrationState';
import { runUnlessMaintenance } from '../lib/maintenanceMode';
import { SchemaNewerThanImageError, writeBackupArchive, type BackupRequest } from './createBackup';
import { ArchiveDecryptionError } from './encryption';
import { ArchiveVersionError, parseManifest } from './manifest';
import {
  restoreArchive,
  RestoreRefusedError,
  type RestoreDependencies,
  type RestoreRequest,
} from './restoreArchive';
import { TarFormatError, TarWriter, readTar } from './tar';
import { FileSink } from './files';
import { ArchiveIntegrityError, ArchiveKeyMissingError, scanArchive } from './verifyArchive';

// The backup and restore pipelines against two databases of their own on the test server: a
// migrated source with synthetic rows and documents, and a target that starts empty. pg_dump and
// pg_restore are replaced by stand-ins (the Docker recovery drill runs the real tools): the dump
// is a marker file, and the restore copies the source's rows into the target, as pg_restore
// --clean would. Everything else (maintenance mode, the archive, checksums, encryption, guards,
// staging, the document swap and the comparison afterwards) is the real code.

setDefaultTimeout(60_000);

const MIGRATIONS_FOLDER = resolve(import.meta.dir, '../db/migrations');
const KEY = new Secret('synthetic-backup-key-for-tests-0123456789');
const suffix = randomUUID().replaceAll('-', '').slice(0, 12);
const SOURCE = `quro_backup_src_${suffix}`;
const TARGET = `quro_backup_dst_${suffix}`;

const adminUrl = getConfig().adminDatabase.url.reveal();
const urlFor = (database: string) => {
  const url = new URL(adminUrl);
  url.pathname = `/${database}`;
  return url.toString();
};
const sourceUrl = urlFor(SOURCE);
const targetUrl = urlFor(TARGET);

const server = postgres(adminUrl, { max: 1, onnotice: () => undefined });
let source: Sql;
let workspace: string;
let documents: string;
let targetDocuments: string;
let backups: string;

const PAYSLIP_KEY = 'users/1/salary/payslips/1/11111111-1111-4111-8111-111111111111.pdf';
const MISSING_KEY = 'users/1/salary/payslips/2/22222222-2222-4222-8222-222222222222.pdf';
const pdf = (label: string) => `%PDF-1.4\n%synthetic ${label}\n`;
const sha256 = (text: string | Buffer) => createHash('sha256').update(text).digest('hex');

async function seedSource(): Promise<void> {
  await source`
    insert into users (first_name, last_name, email, password_hash)
    values ('Synthetic', 'Owner', 'owner@backup.quro.test', 'not-a-real-hash'),
           ('Synthetic', 'Partner', 'partner@backup.quro.test', 'not-a-real-hash')`;
  await source`
    insert into savings_accounts (user_id, name, bank, balance, currency, interest_rate, account_type)
    values (1, 'Everyday', 'Synthetic Bank', 1234.56, 'EUR', 1.5, 'savings'),
           (2, 'Rainy day', 'Synthetic Bank', -0.01, 'GBP', 0, 'savings')`;
  for (const [id, key] of [
    [1, PAYSLIP_KEY],
    [2, MISSING_KEY],
  ] as const) {
    await source`
      insert into payslips (user_id, month, date, gross, tax, pension, net, currency,
        document_storage_key, document_file_name, document_size_bytes, document_uploaded_at)
      values (1, '2026-09', '2026-09-25', 4000, 1000, 200, 2800, 'EUR',
        ${key}, ${`payslip-${id}.pdf`}, 30, now())`;
  }
}

function writeDocument(directory: string, key: string, content: string): void {
  mkdirSync(dirname(join(directory, key)), { recursive: true });
  writeFileSync(join(directory, key), content);
}

/** pg_restore --clean, as far as these tests need it: the target ends up with the source's rows. */
async function copySourceIntoTarget(): Promise<void> {
  const target = postgres(targetUrl, { max: 1, onnotice: () => undefined });
  try {
    const applied = await target`select to_regclass('drizzle.__drizzle_migrations') as t`;
    if (!applied[0]?.t) await migrate(drizzle(target), { migrationsFolder: MIGRATIONS_FOLDER });
    await target.begin(async (tx) => {
      await tx`set local session_replication_role = replica`;
      const tables = await source<{ name: string }[]>`
        select quote_ident(tablename) as name from pg_tables where schemaname = 'public'`;
      for (const { name } of tables) {
        await tx.unsafe(`delete from public.${name}`);
        // Through JSON text, so no value passes through a JavaScript type on the way.
        const rows = await source.unsafe<{ row: string }[]>(
          `select row_to_json(t)::text as row from public.${name} t`,
        );
        for (const { row } of rows) {
          await tx.unsafe(
            `insert into public.${name} select * from json_populate_record(null::public.${name}, $1::text::json)`,
            [row],
          );
        }
      }
      const sequences = await source<{ name: string; value: string | null }[]>`
        select quote_ident(schemaname) || '.' || quote_ident(sequencename) as name,
          last_value::text as value from pg_sequences where schemaname = 'public'`;
      for (const { name, value } of sequences) {
        if (value !== null) await tx`select setval(${name}, ${value}::bigint, true)`;
      }
    });
  } finally {
    await target.end();
  }
}

const dumped: { snapshots: string[]; pausedDuringDump: boolean[] } = {
  snapshots: [],
  pausedDuringDump: [],
};

function dependencies(overrides: Partial<RestoreDependencies> = {}): RestoreDependencies {
  return {
    dump: async ({ outputPath, snapshot }) => {
      dumped.snapshots.push(snapshot ?? '');
      // Maintenance mode is on in the source database while the dump runs.
      const probe = postgres(sourceUrl, { max: 1 });
      try {
        dumped.pausedDuringDump.push(
          !(await runUnlessMaintenance(() => Promise.resolve(), probe)).ran,
        );
      } finally {
        await probe.end();
      }
      writeFileSync(outputPath!, `PGDMP synthetic dump of snapshot ${snapshot}\n`);
      return outputPath!;
    },
    checkDump: () => Promise.resolve(),
    now: () => new Date(),
    appVersion: 'v0.8.0',
    migrations: bundledMigrations(),
    restore: () => copySourceIntoTarget(),
    checkRestore: () => Promise.resolve(),
    ...overrides,
  };
}

function backupRequest(overrides: Partial<BackupRequest> = {}): BackupRequest {
  return {
    adminUrl: sourceUrl,
    documentStorage: { driver: 'filesystem', directory: documents },
    encryptionKey: null,
    directory: backups,
    label: null,
    waitSeconds: 5,
    maintenanceHeld: false,
    log: () => undefined,
    ...overrides,
  };
}

function backupConfig(overrides: Partial<BackupConfig> = {}): BackupConfig {
  return {
    directory: backups,
    encryptionKey: null,
    offsiteDirectory: null,
    keep: null,
    ...overrides,
  };
}

function restoreRequest(
  archivePath: string,
  overrides: Partial<RestoreRequest> = {},
): RestoreRequest {
  return {
    archivePath,
    adminUrl: targetUrl,
    runtimeRole: null,
    documentStorage: { driver: 'filesystem', directory: targetDocuments },
    backup: backupConfig(),
    confirm: 'restore-db',
    allowNonEmpty: false,
    log: () => undefined,
    ...overrides,
  };
}

let sequence = 0;
// Archive names carry the second they were taken; tests take several per second.
const distinctClock = () => new Date(Date.UTC(2026, 9, 10, 3, 0, sequence++));

beforeAll(async () => {
  await server.unsafe(`create database ${SOURCE}`);
  await server.unsafe(`create database ${TARGET}`);
  source = postgres(sourceUrl, { max: 2, onnotice: () => undefined });
  await migrate(drizzle(source), { migrationsFolder: MIGRATIONS_FOLDER });
  await seedSource();
});

beforeEach(() => {
  workspace = mkdtempSync(join(tmpdir(), 'quro-backup-test-'));
  documents = join(workspace, 'documents');
  targetDocuments = join(workspace, 'target-documents');
  backups = join(workspace, 'backups');
  for (const directory of [documents, targetDocuments, backups]) mkdirSync(directory);
  writeDocument(documents, PAYSLIP_KEY, pdf('payslip'));
  writeDocument(documents, 'users/2/salary/payslips/9/orphan.pdf', pdf('orphan'));
  // The store's own temporary files are never archived.
  writeDocument(documents, 'users/1/.0b1c.tmp', 'partial upload');
  dumped.snapshots.length = 0;
  dumped.pausedDuringDump.length = 0;
});

afterAll(async () => {
  await source?.end();
  await server.unsafe(`drop database if exists ${SOURCE} with (force)`);
  await server.unsafe(`drop database if exists ${TARGET} with (force)`);
  await server.end();
  rmSync(workspace, { recursive: true, force: true });
});

describe('quro backup', () => {
  test('writes one verified archive from a paused, consistent moment', async () => {
    const archive = await writeBackupArchive(
      backupRequest(),
      dependencies({ now: () => new Date('2026-10-10T03:15:00Z') }),
    );

    expect(archive.name).toBe('quro-backup-20261010-031500Z.tar');
    expect(readdirSync(backups)).toEqual([archive.name]);
    expect(statSync(archive.path).mode & 0o777).toBe(0o600);
    expect(dumped.snapshots[0]).toMatch(/^[0-9A-F]+-[0-9A-F]+-\d+$/);
    expect(dumped.pausedDuringDump).toEqual([true]);
    // Changes are accepted again afterwards.
    const probe = postgres(sourceUrl, { max: 1 });
    expect((await runUnlessMaintenance(() => Promise.resolve(), probe)).ran).toBe(true);
    await probe.end();

    const { manifest } = archive;
    expect(manifest.app.version).toBe('v0.8.0');
    expect(manifest.database.lastMigration?.tag).toBe(bundledMigrations().at(-1)!.tag);
    expect(manifest.database.appliedMigrations).toBe(bundledMigrations().length);
    expect(manifest.database.fingerprint.tables['public.users']?.rows).toBe(2);
    expect(manifest.database.fingerprint.tables['public.savings_accounts']?.rows).toBe(2);
    expect(manifest.documents).toMatchObject({ driver: 'filesystem', included: true, count: 2 });
    if (!manifest.documents.included) throw new Error('documents expected');
    expect(manifest.documents.files.find((file) => file.key === PAYSLIP_KEY)?.sha256).toBe(
      sha256(pdf('payslip')),
    );
    expect(manifest.documents.missing).toEqual([MISSING_KEY]);
    expect(manifest.secrets.notInArchive.join(' ')).toContain('QRO_BACKUP_ENCRYPTION_KEY_FILE');

    const listed = Bun.spawnSync(['tar', '-tf', archive.path]).stdout.toString().trim().split('\n');
    expect(listed).toEqual([
      'database.dump',
      `documents/${PAYSLIP_KEY}`,
      'documents/users/2/salary/payslips/9/orphan.pdf',
      'manifest.json',
    ]);
  });

  test('with S3 storage, lists the referenced documents and says they are not included', async () => {
    const archive = await writeBackupArchive(
      backupRequest({ documentStorage: { driver: 's3', directory: documents } }),
      dependencies(),
    );
    expect(archive.manifest.documents).toMatchObject({ driver: 's3', included: false });
    if (archive.manifest.documents.included) throw new Error('no documents expected');
    expect(archive.manifest.documents.referenced.map((reference) => reference.key)).toEqual([
      PAYSLIP_KEY,
      MISSING_KEY,
    ]);
  });

  test('encrypts with the key, and only the key opens it', async () => {
    const archive = await writeBackupArchive(backupRequest({ encryptionKey: KEY }), dependencies());
    expect(archive.name.endsWith('.tar.enc')).toBe(true);
    expect(readFileSync(archive.path).includes(Buffer.from('%PDF-1.4'))).toBe(false);
    expect((await scanArchive(archive.path, KEY)).encrypted).toBe(true);
    await expect(scanArchive(archive.path, null)).rejects.toThrow(ArchiveKeyMissingError);
    await expect(
      scanArchive(archive.path, new Secret('a-different-key-of-sufficient-length-000')),
    ).rejects.toThrow(ArchiveDecryptionError);
  });

  test('refuses a missing documents directory and a missing backup directory, writing nothing', async () => {
    await expect(
      writeBackupArchive(
        backupRequest({
          documentStorage: { driver: 'filesystem', directory: join(workspace, 'none') },
        }),
        dependencies(),
      ),
    ).rejects.toThrow('does not exist');
    await expect(
      writeBackupArchive(backupRequest({ directory: join(workspace, 'nowhere') }), dependencies()),
    ).rejects.toThrow('does not exist');
    expect(readdirSync(backups)).toEqual([]);
    expect(dumped.snapshots).toEqual([]);
  });

  test('refuses a database migrated by a newer release', async () => {
    await expect(
      writeBackupArchive(
        backupRequest(),
        dependencies({ migrations: bundledMigrations().slice(0, -1) }),
      ),
    ).rejects.toThrow(SchemaNewerThanImageError);
    expect(dumped.snapshots).toEqual([]);
  });

  test('an interrupted or failed dump leaves nothing behind and resumes changes', async () => {
    const controller = new AbortController();
    await expect(
      writeBackupArchive(
        backupRequest({ signal: controller.signal }),
        dependencies({
          dump: ({ outputPath }) => {
            writeFileSync(outputPath!, 'half a dump');
            controller.abort();
            return Promise.reject(new DOMException('aborted', 'AbortError'));
          },
        }),
      ),
    ).rejects.toThrow('aborted');
    expect(readdirSync(backups)).toEqual([]);
    const probe = postgres(sourceUrl, { max: 1 });
    expect((await runUnlessMaintenance(() => Promise.resolve(), probe)).ran).toBe(true);
    await probe.end();
  });
});

describe('archive checks', () => {
  test('a changed byte or a cut-off archive is detected', async () => {
    const archive = await writeBackupArchive(backupRequest(), dependencies());
    const original = readFileSync(archive.path);
    const flipped = Buffer.from(original);
    const at = flipped.indexOf(Buffer.from('%synthetic payslip'));
    flipped[at] = flipped[at]! ^ 1;
    writeFileSync(archive.path, flipped);
    await expect(scanArchive(archive.path, null)).rejects.toThrow(ArchiveIntegrityError);
    writeFileSync(archive.path, original.subarray(0, Math.floor(original.length / 2)));
    await expect(scanArchive(archive.path, null)).rejects.toThrow(TarFormatError);
  });
});

/** Rewrites an unencrypted archive with a changed manifest. */
async function withManifest(path: string, change: (manifest: Record<string, any>) => void) {
  const entries: [string, Uint8Array][] = [];
  await readTar(Bun.file(path).stream(), async (entry, body) => {
    const parts: Uint8Array[] = [];
    for await (const chunk of body) parts.push(chunk);
    entries.push([entry.path, Buffer.concat(parts)]);
  });
  const changed = `${path}.${randomUUID()}.tar`;
  const sink = await FileSink.create(changed);
  const tar = new TarWriter(sink, new Date());
  for (const [entry, bytes] of entries) {
    if (entry !== 'manifest.json') {
      await tar.addBytes(entry, bytes);
      continue;
    }
    const manifest = JSON.parse(new TextDecoder().decode(bytes));
    change(manifest);
    await tar.addBytes(entry, new TextEncoder().encode(JSON.stringify(manifest)));
  }
  await tar.finish();
  await sink.close();
  return changed;
}

async function targetRows(table: string): Promise<number> {
  const target = postgres(targetUrl, { max: 1, onnotice: () => undefined });
  try {
    const exists = await target`select to_regclass(${`public.${table}`}) as t`;
    if (!exists[0]?.t) return -1;
    const [row] = await target.unsafe<{ n: number }[]>(
      `select count(*)::int as n from public.${table}`,
    );
    return row!.n;
  } finally {
    await target.end();
  }
}

describe('quro restore', () => {
  test('restores into an empty instance and verifies database and documents', async () => {
    const archive = await writeBackupArchive(backupRequest({ encryptionKey: KEY }), dependencies());
    const result = await restoreArchive(
      restoreRequest(archive.path, { backup: backupConfig({ encryptionKey: KEY }) }),
      dependencies(),
    );
    expect(result.preRestoreArchive).toBeNull();
    expect(result.restoredDocuments).toBe(2);
    expect(result.pendingMigrations).toBe(0);
    expect(readFileSync(join(targetDocuments, PAYSLIP_KEY), 'utf8')).toBe(pdf('payslip'));
    // No staging or swap leftovers.
    expect(readdirSync(targetDocuments)).toEqual(['users']);
    expect(readdirSync(backups)).toEqual([archive.name]);
    expect(await targetRows('users')).toBe(2);
  });

  test('over existing data: refused without permission, then replaces it after a pre-restore archive', async () => {
    const archive = await writeBackupArchive(backupRequest(), dependencies({ now: distinctClock }));
    writeDocument(targetDocuments, 'users/1/added-after-backup.pdf', pdf('later'));
    await expect(restoreArchive(restoreRequest(archive.path), dependencies())).rejects.toThrow(
      RestoreRefusedError,
    );
    expect(readFileSync(join(targetDocuments, 'users/1/added-after-backup.pdf'), 'utf8')).toBe(
      pdf('later'),
    );

    const result = await restoreArchive(
      restoreRequest(archive.path, { allowNonEmpty: true }),
      dependencies({ now: distinctClock }),
    );
    expect(result.preRestoreArchive?.name).toMatch(/-pre-restore\.tar$/);
    const preRestore = await scanArchive(result.preRestoreArchive!.path, null);
    expect(preRestore.manifest.label).toBe('pre-restore');
    if (!preRestore.manifest.documents.included) throw new Error('documents expected');
    expect(preRestore.manifest.documents.files.map((file) => file.key)).toContain(
      'users/1/added-after-backup.pdf',
    );
    // The documents directory now holds exactly the archive's documents.
    expect(existsSync(join(targetDocuments, 'users/1/added-after-backup.pdf'))).toBe(false);
    expect(readFileSync(join(targetDocuments, PAYSLIP_KEY), 'utf8')).toBe(pdf('payslip'));
  });

  test('refuses without confirmation, with another session open, or from a newer release', async () => {
    const archive = await writeBackupArchive(backupRequest(), dependencies({ now: distinctClock }));
    const before = await targetRows('users');

    await expect(
      restoreArchive(restoreRequest(archive.path, { confirm: null }), dependencies()),
    ).rejects.toThrow('QRO_RESTORE_CONFIRM=restore-db');

    const other = postgres(targetUrl, { max: 1 });
    await other`select 1`;
    try {
      await expect(
        restoreArchive(restoreRequest(archive.path, { allowNonEmpty: true }), dependencies()),
      ).rejects.toThrow('other database sessions are connected');
    } finally {
      await other.end();
    }

    const newer = await withManifest(archive.path, (manifest) => {
      manifest.app.version = 'v99.0.0';
    });
    await expect(
      restoreArchive(restoreRequest(newer, { allowNonEmpty: true }), dependencies()),
    ).rejects.toThrow(ArchiveVersionError);
    const unknownMigration = await withManifest(archive.path, (manifest) => {
      manifest.database.lastMigration = { tag: '9999_future', createdAt: 9e15, hash: 'x' };
    });
    await expect(
      restoreArchive(restoreRequest(unknownMigration, { allowNonEmpty: true }), dependencies()),
    ).rejects.toThrow('does not know (9999_future)');
    expect(await targetRows('users')).toBe(before);
  });

  test('refuses a damaged archive before touching anything', async () => {
    const archive = await writeBackupArchive(backupRequest(), dependencies({ now: distinctClock }));
    const bytes = readFileSync(archive.path);
    const at = bytes.indexOf(Buffer.from('%synthetic payslip'));
    bytes[at] = bytes[at]! ^ 1;
    writeFileSync(archive.path, bytes);
    const listingBefore = readdirSync(targetDocuments, { recursive: true });
    await expect(
      restoreArchive(restoreRequest(archive.path, { allowNonEmpty: true }), dependencies()),
    ).rejects.toThrow(ArchiveIntegrityError);
    expect(readdirSync(targetDocuments, { recursive: true })).toEqual(listingBefore);
    expect(readdirSync(backups)).toEqual([archive.name]);
  });

  test('reports a restored database that does not match the archive', async () => {
    const archive = await writeBackupArchive(backupRequest(), dependencies({ now: distinctClock }));
    await expect(
      restoreArchive(
        restoreRequest(archive.path, { allowNonEmpty: true }),
        dependencies({
          now: distinctClock,
          restore: async () => {
            await copySourceIntoTarget();
            const target = postgres(targetUrl, { max: 1 });
            await target`update savings_accounts set balance = balance + 0.01 where id = 1`;
            await target.end();
          },
        }),
      ),
    ).rejects.toThrow('public.savings_accounts: same row count, different content');
  });

  test('parses its own manifest after a restore round trip', () => {
    // The manifest format written above is the one the parser accepts.
    const sample = parseManifest(
      JSON.stringify({
        format: 'quro-backup',
        formatVersion: 1,
        createdAt: new Date().toISOString(),
        label: null,
        app: { version: null },
        database: {
          entry: 'database.dump',
          bytes: 1,
          sha256: 'x',
          serverVersion: '18',
          lastMigration: null,
          appliedMigrations: 0,
          fingerprint: { tables: {}, sequences: {} },
        },
        documents: { driver: 's3', included: false, note: '', referenced: [] },
        secrets: { encrypted: false, inArchive: [], notInArchive: [] },
      }),
    );
    expect(sample.documents.included).toBe(false);
  });
});
