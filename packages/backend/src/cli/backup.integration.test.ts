import { afterEach, beforeEach, describe, expect, setDefaultTimeout, test } from 'bun:test';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { runUnlessMaintenance } from '../lib/maintenanceMode';
import type { BackupDependencies } from '../backup/createBackup';
import { bundledMigrations } from '../db/migrationState';
import { applyTestSettings, writeTestSecret } from '../test/config';
import { runBackupCommand } from './backup';
import { EXIT_FAILURE, EXIT_OK, EXIT_REFUSED, EXIT_UNAVAILABLE, EXIT_USAGE } from './io';
import { runQuro } from './quro';
import { runRestoreCommand } from './restore';

// The commands' arguments, output and exit codes, against the test database. pg_dump is a
// stand-in that writes a marker file (the recovery drill runs the real tools); restores here stop
// at a guard or a damaged archive, before anything is changed.

setDefaultTimeout(60_000);

const KEY_FILE = writeTestSecret('backup_key', 'synthetic-backup-key-for-tests-0123456789');
const OTHER_KEY_FILE = writeTestSecret('other_backup_key', 'another-synthetic-key-for-tests-98765');

let workspace: string;
let backups: string;
let offsite: string;
let documents: string;
let restoreSettings: () => void = () => undefined;
let tick = 0;

const fakes = (): BackupDependencies => ({
  dump: ({ outputPath }) => {
    writeFileSync(outputPath!, 'PGDMP synthetic\n');
    return Promise.resolve(outputPath!);
  },
  checkDump: () => Promise.resolve(),
  now: () => new Date(Date.UTC(2026, 9, 10, 3, 0, tick++)),
  appVersion: 'v0.8.0',
  migrations: bundledMigrations(),
});

function capture() {
  const out: string[] = [];
  const err: string[] = [];
  return {
    io: { out: (line: string) => out.push(line), err: (line: string) => err.push(line) },
    out: () => out.join('\n'),
    err: () => err.join('\n'),
  };
}

async function backup(...args: string[]) {
  const output = capture();
  const exitCode = await runBackupCommand(args, output.io, fakes());
  return { exitCode, out: output.out(), err: output.err() };
}

async function restore(...args: string[]) {
  const output = capture();
  const exitCode = await runRestoreCommand(args, output.io);
  return { exitCode, out: output.out(), err: output.err() };
}

async function quro(...args: string[]) {
  const output = capture();
  const exitCode = await runQuro(args, output.io);
  return { exitCode, out: output.out(), err: output.err() };
}

function settings(extra: Record<string, string | undefined> = {}) {
  restoreSettings();
  restoreSettings = applyTestSettings({
    QRO_DOCUMENT_STORAGE: 'filesystem',
    QRO_DOCUMENTS_DIR: documents,
    QRO_BACKUP_DIR: backups,
    QRO_BACKUP_ENCRYPTION_KEY_FILE: undefined,
    QRO_BACKUP_OFFSITE_DIR: undefined,
    QRO_BACKUP_KEEP: undefined,
    QRO_RESTORE_CONFIRM: undefined,
    QRO_RESTORE_ALLOW_NON_EMPTY: undefined,
    ADMIN_DATABASE_URL: process.env.ADMIN_DATABASE_URL,
    ...extra,
  });
}

beforeEach(() => {
  workspace = mkdtempSync(join(tmpdir(), 'quro-backup-cli-'));
  backups = join(workspace, 'backups');
  offsite = join(workspace, 'offsite');
  documents = join(workspace, 'documents');
  for (const directory of [backups, offsite, documents]) mkdirSync(directory);
  mkdirSync(join(documents, 'users/1'), { recursive: true });
  writeFileSync(join(documents, 'users/1/statement.pdf'), '%PDF-1.4 synthetic');
  settings();
});

afterEach(() => {
  restoreSettings();
  restoreSettings = () => undefined;
  chmodSync(offsite, 0o700);
  rmSync(workspace, { recursive: true, force: true });
});

describe('quro backup', () => {
  test('is listed by quro and explains itself', async () => {
    expect((await quro('--help')).out).toContain('backup      Write one archive');
    const help = await quro('backup', '--help');
    expect(help.exitCode).toBe(EXIT_OK);
    expect(help.out).toContain('Usage: quro backup');
    expect((await quro('restore', '--help')).out).toContain('QRO_RESTORE_CONFIRM=restore-db');
  });

  test('rejects unknown options and bad values with exit code 2', async () => {
    expect((await quro('backup', '--force')).exitCode).toBe(EXIT_USAGE);
    expect((await quro('backup', '--label', 'Bad Label')).exitCode).toBe(EXIT_USAGE);
    expect((await quro('backup', '--wait', 'soon')).exitCode).toBe(EXIT_USAGE);
    expect((await quro('restore')).exitCode).toBe(EXIT_USAGE);
    expect((await quro('restore', 'a.tar', 'b.tar')).exitCode).toBe(EXIT_USAGE);
  });

  test('writes, describes and verifies an archive', async () => {
    const result = await backup('--label', 'before-upgrade');
    expect(result.exitCode).toBe(EXIT_OK);
    expect(result.out).toContain('Pausing changes');
    expect(result.out).toContain('Changes resumed');
    expect(result.out).toContain('Documents: 1 (0.0 MiB), checked by SHA-256');
    expect(result.out).toContain('Not encrypted');
    const [name] = readdirSync(backups);
    expect(name).toMatch(/^quro-backup-\d{8}-\d{6}Z-before-upgrade\.tar$/);
    const verified = await quro('backup', 'verify', join(backups, name!));
    expect(verified.exitCode).toBe(EXIT_OK);
    expect(verified.out).toContain('complete, every checksum matches');
  });

  test('a missing backup directory is a settings problem and writes nothing', async () => {
    settings({ QRO_BACKUP_DIR: join(workspace, 'missing') });
    const result = await backup();
    expect(result.exitCode).toBe(EXIT_USAGE);
    expect(result.err).toContain('does not exist');
    expect(result.err).toContain('Nothing was written.');
  });

  test('encrypts, copies off the device and keeps the newest archives', async () => {
    settings({
      QRO_BACKUP_ENCRYPTION_KEY_FILE: KEY_FILE,
      QRO_BACKUP_OFFSITE_DIR: offsite,
      QRO_BACKUP_KEEP: '2',
    });
    writeFileSync(
      join(backups, 'quro-backup-20200101-000000Z-before-upgrade.tar'),
      'kept: labelled',
    );
    writeFileSync(join(backups, 'notes.txt'), 'kept: not an archive');
    for (let run = 0; run < 3; run += 1) expect((await backup()).exitCode).toBe(EXIT_OK);
    const local = readdirSync(backups).sort();
    expect(local).toEqual([
      'notes.txt',
      'quro-backup-20200101-000000Z-before-upgrade.tar',
      expect.stringMatching(/\.tar\.enc$/),
      expect.stringMatching(/\.tar\.enc$/),
    ]);
    const copies = readdirSync(offsite).sort();
    expect(copies).toEqual(local.filter((name) => name.endsWith('.enc')));
    for (const name of copies) {
      expect(readFileSync(join(offsite, name)).equals(readFileSync(join(backups, name)))).toBe(
        true,
      );
    }
  });

  // Root ignores file permissions, so the copy cannot be made to fail this way.
  test.skipIf(process.getuid?.() === 0)(
    'a failed off-device copy fails the backup and deletes no older archive',
    async () => {
      settings({
        QRO_BACKUP_ENCRYPTION_KEY_FILE: KEY_FILE,
        QRO_BACKUP_OFFSITE_DIR: offsite,
        QRO_BACKUP_KEEP: '1',
      });
      expect((await backup()).exitCode).toBe(EXIT_OK);
      chmodSync(offsite, 0o500);
      const failed = await backup();
      expect(failed.exitCode).not.toBe(EXIT_OK);
      expect(failed.err).toContain('not writable');
      // Both local archives are still there: retention runs only after every check passed.
      expect(readdirSync(backups).filter((name) => name.endsWith('.enc'))).toHaveLength(2);
    },
  );

  test('an unreachable database is exit code 4 and writes nothing', async () => {
    settings({ ADMIN_DATABASE_URL: 'postgres://quro:unused@127.0.0.1:9/quro' });
    const result = await backup();
    expect(result.exitCode).toBe(EXIT_UNAVAILABLE);
    expect(result.err).toContain('The database cannot be reached');
    expect(result.err).not.toContain('unused');
    expect(readdirSync(backups)).toEqual([]);
  });

  test('an off-device directory without encryption is refused as a setting', async () => {
    settings({ QRO_BACKUP_OFFSITE_DIR: offsite });
    const result = await backup();
    expect(result.exitCode).toBe(EXIT_USAGE);
    expect(result.err).toContain('QRO_BACKUP_OFFSITE_DIR');
  });
});

describe('archive problems and restore guards', () => {
  async function encryptedArchive(): Promise<string> {
    settings({ QRO_BACKUP_ENCRYPTION_KEY_FILE: KEY_FILE });
    expect((await backup()).exitCode).toBe(EXIT_OK);
    return join(backups, readdirSync(backups)[0]!);
  }

  test('a missing archive is exit code 2', async () => {
    settings({ QRO_RESTORE_CONFIRM: 'restore-db' });
    const result = await restore(join(workspace, 'nothing-here.tar'));
    expect(result.exitCode).toBe(EXIT_USAGE);
    expect(result.err).toContain('No archive at');
    expect((await quro('backup', 'verify', join(workspace, 'none.tar'))).exitCode).toBe(EXIT_USAGE);
  });

  test('restore without confirmation is refused with exit code 3', async () => {
    const archive = await encryptedArchive();
    settings({ QRO_BACKUP_ENCRYPTION_KEY_FILE: KEY_FILE });
    const result = await restore(archive);
    expect(result.exitCode).toBe(EXIT_REFUSED);
    expect(result.err).toContain('QRO_RESTORE_CONFIRM=restore-db');
  });

  test('an encrypted archive needs its key: none is exit code 2, a wrong one exit code 1', async () => {
    const archive = await encryptedArchive();
    settings({ QRO_RESTORE_CONFIRM: 'restore-db' });
    const withoutKey = await restore(archive);
    expect(withoutKey.exitCode).toBe(EXIT_USAGE);
    expect(withoutKey.err).toContain('The archive is encrypted');
    settings({ QRO_RESTORE_CONFIRM: 'restore-db', QRO_BACKUP_ENCRYPTION_KEY_FILE: OTHER_KEY_FILE });
    const wrongKey = await restore(archive);
    expect(wrongKey.exitCode).toBe(EXIT_FAILURE);
    expect(wrongKey.err).toContain('could not be decrypted');
  });

  test('a damaged or truncated archive is exit code 1', async () => {
    const archive = await encryptedArchive();
    const bytes = readFileSync(archive);
    bytes[Math.floor(bytes.length / 2)] = bytes[Math.floor(bytes.length / 2)]! ^ 1;
    writeFileSync(archive, bytes);
    settings({ QRO_RESTORE_CONFIRM: 'restore-db', QRO_BACKUP_ENCRYPTION_KEY_FILE: KEY_FILE });
    expect((await restore(archive)).exitCode).toBe(EXIT_FAILURE);
    expect((await quro('backup', 'verify', archive)).exitCode).toBe(EXIT_FAILURE);
    writeFileSync(archive, bytes.subarray(0, 100));
    expect((await restore(archive)).exitCode).toBe(EXIT_FAILURE);
  });

  test('a bare database dump is recognised and pointed at the right procedure', async () => {
    const dump = join(workspace, 'quro-20261009-001322.dump');
    writeFileSync(dump, 'PGDMP\u0001\u000e\u0000 synthetic');
    settings({ QRO_RESTORE_CONFIRM: 'restore-db' });
    const result = await restore(dump);
    expect(result.exitCode).toBe(EXIT_FAILURE);
    expect(result.err).toContain('bare PostgreSQL dump');
  });
});

describe('an interrupted backup', () => {
  test('SIGTERM stops pg_dump, removes the temporary files and ends the pause', async () => {
    const slowDump = join(workspace, 'slow-pg-dump.sh');
    writeFileSync(
      slowDump,
      '#!/bin/sh\nif [ "$1" = "--version" ]; then echo "pg_dump (PostgreSQL) 99.0"; exit 0; fi\nexec sleep 30\n',
    );
    chmodSync(slowDump, 0o755);
    const child = Bun.spawn([process.execPath, 'src/cli/quro.ts', 'backup'], {
      cwd: resolve(import.meta.dir, '../..'),
      env: {
        ...process.env,
        QRO_PG_DUMP_BIN: slowDump,
        QRO_BACKUP_DIR: backups,
        QRO_DOCUMENTS_DIR: documents,
        QRO_DOCUMENT_STORAGE: 'filesystem',
      },
      stdout: 'pipe',
      stderr: 'pipe',
    });
    try {
      const reader = child.stdout.getReader();
      let output = '';
      while (!output.includes('Dumping the database')) {
        const { value, done } = await reader.read();
        if (done) throw new Error(`backup ended early: ${output}`);
        output += new TextDecoder().decode(value);
      }
      // Paused while pg_dump runs.
      expect((await runUnlessMaintenance(() => Promise.resolve())).ran).toBe(false);

      child.kill('SIGTERM');
      expect(await child.exited).toBe(EXIT_FAILURE);
      expect(await new Response(child.stderr).text()).toContain('Interrupted. Nothing was kept');
      expect(readdirSync(backups)).toEqual([]);
      expect((await runUnlessMaintenance(() => Promise.resolve())).ran).toBe(true);
    } finally {
      child.kill('SIGKILL');
    }
  });
});
