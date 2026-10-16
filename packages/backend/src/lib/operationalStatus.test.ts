import { afterAll, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DAY_MS, HOUR_MS } from '../constants/time';
import {
  archiveTime,
  classifyBackup,
  classifyDisk,
  classifyDocuments,
  classifyFreshness,
  classifyJob,
  countMissingDocuments,
  newestBackup,
  readDiskFacts,
  type JobExpectation,
  type JobRow,
} from './operationalStatus';

const now = new Date('2026-10-16T12:00:00Z');
const ago = (ms: number) => new Date(now.getTime() - ms);
const daily = (core: boolean): JobExpectation => ({
  name: 'currency-rate-sync',
  intervalMs: DAY_MS,
  core,
});
const success = (at: Date): JobRow => ({ workerName: 'scheduler:currency-rate-sync', at });
const failure = (at: Date): JobRow => ({ workerName: 'scheduler-failed:currency-rate-sync', at });

describe('classifyJob', () => {
  test('a job with no record is unknown, never healthy', () => {
    expect(classifyJob(daily(true), [], now).health).toBe('unknown');
  });

  test('a recent success is ok and an old one is stale', () => {
    expect(classifyJob(daily(true), [success(ago(HOUR_MS))], now).health).toBe('ok');
    expect(classifyJob(daily(true), [success(ago(3 * DAY_MS))], now).health).toBe('fail');
  });

  test('a failure after the last success is failing', () => {
    const rows = [success(ago(2 * HOUR_MS)), failure(ago(HOUR_MS))];
    expect(classifyJob(daily(true), rows, now)).toMatchObject({ health: 'fail' });
    expect(classifyJob(daily(true), rows, now).message).toContain('failing');
  });

  test('an earlier failure that a later success cleared is ok', () => {
    const rows = [failure(ago(3 * HOUR_MS)), success(ago(HOUR_MS))];
    expect(classifyJob(daily(true), rows, now).health).toBe('ok');
  });

  test('an optional integration outage is a warning, a core job a failure', () => {
    const rows = [success(ago(5 * DAY_MS))];
    expect(classifyJob(daily(false), rows, now).health).toBe('warn');
    expect(classifyJob(daily(true), rows, now).health).toBe('fail');
    expect(classifyJob(daily(false), rows, now).message).toContain('optional integration');
  });
});

describe('classifyFreshness', () => {
  const facts = {
    ratesAt: ago(HOUR_MS),
    bunqAt: null,
    bunqConnections: 0,
    snapshotDate: '2026-10-16',
  };

  test('reports fresh data as ok and omits bank links when there are none', () => {
    const findings = classifyFreshness(facts, now);
    expect(findings.map((f) => [f.id, f.health])).toEqual([
      ['freshness.currency_rates', 'ok'],
      ['freshness.net_worth', 'ok'],
    ]);
  });

  test('no rates is unknown, old rates and unsynced bank links are not healthy', () => {
    expect(classifyFreshness({ ...facts, ratesAt: null }, now)[0]!.health).toBe('unknown');
    expect(classifyFreshness({ ...facts, ratesAt: ago(5 * DAY_MS) }, now)[0]!.health).toBe('warn');
    const bunq = classifyFreshness({ ...facts, bunqConnections: 2 }, now).at(-1)!;
    expect(bunq).toMatchObject({ id: 'freshness.bunq', health: 'unknown' });
    const stale = classifyFreshness({ ...facts, bunqConnections: 1, bunqAt: ago(4 * DAY_MS) }, now);
    expect(stale.at(-1)!.health).toBe('warn');
  });
});

describe('disk space', () => {
  const GIB = 1024 ** 3;

  test('warns below 10% free and fails below 3% (disk full)', () => {
    expect(classifyDisk('d', 'Disk', { freeBytes: 50 * GIB, totalBytes: 100 * GIB }).health).toBe(
      'ok',
    );
    expect(classifyDisk('d', 'Disk', { freeBytes: 5 * GIB, totalBytes: 100 * GIB }).health).toBe(
      'warn',
    );
    expect(classifyDisk('d', 'Disk', { freeBytes: 0, totalBytes: 100 * GIB }).health).toBe('fail');
    expect(classifyDisk('d', 'Disk', { freeBytes: 0, totalBytes: 0 }).health).toBe('fail');
  });

  test('reads free and total bytes from the filesystem', async () => {
    const facts = await readDiskFacts('/', (() =>
      Promise.resolve({
        bavail: 25,
        bsize: 4096,
        blocks: 100,
      })) as never);
    expect(facts).toEqual({ freeBytes: 25 * 4096, totalBytes: 100 * 4096 });
  });
});

describe('backups', () => {
  const scratch = mkdtempSync(join(tmpdir(), 'quro-ops-'));
  afterAll(() => rmSync(scratch, { recursive: true, force: true }));

  test('reads the time from an archive name and ignores other files', () => {
    expect(archiveTime('quro-backup-20261015-031500Z.tar')?.toISOString()).toBe(
      '2026-10-15T03:15:00.000Z',
    );
    expect(archiveTime('quro-backup-20261015-031500Z-pre-restore.tar.enc')).not.toBeNull();
    expect(archiveTime('notes.txt')).toBeNull();
    expect(archiveTime('.quro-backup-20261015-031500Z.tar.partial')).toBeNull();
  });

  test('finds the newest archive, and none in an empty directory', async () => {
    const dir = join(scratch, 'backups');
    mkdirSync(dir);
    expect(await newestBackup(dir)).toBeNull();
    for (const name of [
      'quro-backup-20261010-000000Z.tar',
      'quro-backup-20261014-000000Z.tar',
      'x.txt',
    ]) {
      writeFileSync(join(dir, name), '');
    }
    expect((await newestBackup(dir))?.toISOString()).toBe('2026-10-14T00:00:00.000Z');
  });

  test('unknown when there is none or the directory is unreadable, stale when old', () => {
    expect(classifyBackup(null, now).health).toBe('unknown');
    expect(classifyBackup(null, now, false).health).toBe('unknown');
    expect(classifyBackup(ago(HOUR_MS), now).health).toBe('ok');
    expect(classifyBackup(ago(5 * DAY_MS), now).health).toBe('warn');
  });
});

describe('referenced documents', () => {
  const scratch = mkdtempSync(join(tmpdir(), 'quro-docs-'));
  afterAll(() => rmSync(scratch, { recursive: true, force: true }));

  test('counts the referenced keys with no file, and refuses an unsafe key', async () => {
    mkdirSync(join(scratch, 'users/1'), { recursive: true });
    writeFileSync(join(scratch, 'users/1/a.pdf'), 'x');
    const result = await countMissingDocuments(scratch, [
      'users/1/a.pdf',
      'users/1/b.pdf',
      '../escape',
    ]);
    expect(result).toEqual({ checked: 3, missing: 2 });
  });

  test('a store that lost every file is reported as failed with a remedy', () => {
    expect(classifyDocuments({ checked: 0, missing: 0 }).health).toBe('ok');
    expect(classifyDocuments({ checked: 3, missing: 0 }).health).toBe('ok');
    const lost = classifyDocuments({ checked: 3, missing: 3 });
    expect(lost.health).toBe('fail');
    expect(lost.message).toContain('bind mount');
    expect(classifyDocuments({ checked: 3, missing: 1 }).message).not.toContain('bind mount');
  });
});
