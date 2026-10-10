import { describe, expect, mock, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConfigError } from '../config';
import { createFilesystemDocumentStore } from './filesystemDocumentStore';
import { BUNDLED_MIGRATIONS } from '../db/schemaVersion';
import {
  checkDocumentStorageReadiness,
  checkSchemaReadiness,
  getCoreReadinessReport,
  getHealthReport,
  getPensionImportReadinessReport,
  getReadinessStatusCode,
  type ReadinessCheck,
} from './readiness';

const NOW = new Date('2026-08-04T12:00:00.000Z');

function check(ready: boolean, required = true): ReadinessCheck {
  return {
    required,
    ready,
    reason: ready ? null : 'test_failure',
    message: ready ? 'Ready.' : 'Not ready.',
    checkedAt: NOW.toISOString(),
  };
}

describe('readiness report aggregation', () => {
  test('returns a stable health report', () => {
    expect(getHealthReport(NOW)).toEqual({
      status: 'ok',
      checkedAt: NOW.toISOString(),
    });
  });

  test('maps all required checks ready to ready and HTTP 200', async () => {
    const report = await getCoreReadinessReport(NOW, {
      checkDatabase: () => Promise.resolve(check(true)),
      checkSchema: () => Promise.resolve(check(true)),
      checkDocumentStorage: () => Promise.resolve(check(true)),
      checkPensionImport: () => Promise.resolve(check(true, false)),
    });

    expect(report.status).toBe('ready');
    expect(getReadinessStatusCode(report)).toBe(200);
  });

  test('maps any failed required check to not ready and HTTP 503', async () => {
    const report = await getCoreReadinessReport(NOW, {
      checkDatabase: () => Promise.resolve(check(true)),
      checkSchema: () => Promise.resolve(check(true)),
      checkDocumentStorage: () => Promise.resolve(check(false)),
      checkPensionImport: () => Promise.resolve(check(true, false)),
    });

    expect(report.status).toBe('not_ready');
    expect(getReadinessStatusCode(report)).toBe(503);
  });

  test('does not let an optional pension import failure affect core status', async () => {
    const report = await getCoreReadinessReport(NOW, {
      checkDatabase: () => Promise.resolve(check(true)),
      checkSchema: () => Promise.resolve(check(true)),
      checkDocumentStorage: () => Promise.resolve(check(true)),
      checkPensionImport: () => Promise.resolve(check(false, false)),
    });

    expect(report.status).toBe('ready');
    expect(report.optional.pensionImport.ready).toBe(false);
    expect(getReadinessStatusCode(report)).toBe(200);
  });

  test('passes the database failure through to the pension import check', async () => {
    const checkPensionImport = mock(() => Promise.resolve(check(false, false)));

    await getCoreReadinessReport(NOW, {
      checkDatabase: () => Promise.resolve(check(false)),
      checkSchema: () => Promise.resolve(check(false)),
      checkDocumentStorage: () => Promise.resolve(check(true)),
      checkPensionImport,
    });

    expect(checkPensionImport).toHaveBeenCalledWith(NOW, {
      skipDueToDatabaseFailure: true,
    });
  });

  test('maps the dedicated pension report in both directions', async () => {
    const ready = await getPensionImportReadinessReport(NOW, {
      checkPensionImport: () => Promise.resolve(check(true, false)),
    });
    const unavailable = await getPensionImportReadinessReport(NOW, {
      checkPensionImport: () => Promise.resolve(check(false, false)),
    });

    expect(ready.status).toBe('ready');
    expect(getReadinessStatusCode(ready)).toBe(200);
    expect(unavailable.status).toBe('not_ready');
    expect(getReadinessStatusCode(unavailable)).toBe(503);
  });
});

describe('document storage readiness', () => {
  test('distinguishes missing configuration from connection failures', async () => {
    const notConfigured = await checkDocumentStorageReadiness(NOW, () =>
      Promise.reject(new ConfigError([{ setting: 'S3_BUCKET', message: 'required' }])),
    );
    const connectionFailed = await checkDocumentStorageReadiness(NOW, () =>
      Promise.reject(new Error('offline')),
    );

    expect(notConfigured).toMatchObject({ ready: false, reason: 'not_configured' });
    expect(connectionFailed).toMatchObject({ ready: false, reason: 'connection_failed' });
  });

  test('checks the filesystem driver by its directory', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'quro-readiness-documents-'));
    try {
      const store = createFilesystemDocumentStore(directory);
      const missing = createFilesystemDocumentStore(join(directory, 'not-mounted'));
      expect(await checkDocumentStorageReadiness(NOW, () => store.check())).toMatchObject({
        ready: true,
      });
      expect(await checkDocumentStorageReadiness(NOW, () => missing.check())).toMatchObject({
        ready: false,
        reason: 'connection_failed',
      });
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  test('reports a never-resolving storage check as failed after the timeout', async () => {
    const report = await checkDocumentStorageReadiness(
      NOW,
      () => new Promise<void>(() => undefined),
      5,
    );

    expect(report).toMatchObject({ ready: false, reason: 'connection_failed' });
  });
});

describe('schema readiness', () => {
  const newest = BUNDLED_MIGRATIONS.at(-1)!;
  const previous = BUNDLED_MIGRATIONS.at(-2)!;
  const schema = (latest: number | null) =>
    checkSchemaReadiness(NOW, {}, () => Promise.resolve(latest));

  test('is ready only when the newest applied migration is the newest bundled one', async () => {
    expect(await schema(newest.when)).toMatchObject({ ready: true, reason: null });
  });

  test('reports a schema behind the image with the command that fixes it', async () => {
    const behind = await schema(previous.when);
    expect(behind).toMatchObject({ required: true, ready: false, reason: 'schema_behind' });
    expect(behind.message).toContain('1 migration(s) behind');
    expect(behind.message).toContain('quro migrate');
    expect(await schema(null)).toMatchObject({ ready: false, reason: 'schema_empty' });
  });

  test('reports a schema newer than the image, or one it does not know, as incompatible', async () => {
    const ahead = await schema(newest.when + 1);
    expect(ahead).toMatchObject({ ready: false, reason: 'schema_ahead' });
    expect(ahead.message).toContain('newer than this image');
    expect(await schema(newest.when - 1)).toMatchObject({ ready: false, reason: 'schema_unknown' });
  });

  test('says when the runtime role cannot read the migration history', async () => {
    const denied = await checkSchemaReadiness(NOW, {}, () =>
      Promise.reject(Object.assign(new Error('permission denied'), { code: '42501' })),
    );
    expect(denied).toMatchObject({ ready: false, reason: 'schema_unreadable' });
    expect(await checkSchemaReadiness(NOW, { skipDueToDatabaseFailure: true })).toMatchObject({
      ready: false,
      reason: 'database_unavailable',
    });
  });

  test('keeps the instance not ready when the schema does not match', async () => {
    const report = await getCoreReadinessReport(NOW, {
      checkDatabase: () => Promise.resolve(check(true)),
      checkSchema: () => Promise.resolve(check(false)),
      checkDocumentStorage: () => Promise.resolve(check(true)),
      checkPensionImport: () => Promise.resolve(check(true, false)),
    });
    expect(report.status).toBe('not_ready');
    expect(getReadinessStatusCode(report)).toBe(503);
  });
});
