import { describe, expect, mock, test } from 'bun:test';
import { S3ConfigurationError } from './s3';
import {
  checkDocumentStorageReadiness,
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
      checkDocumentStorage: () => Promise.resolve(check(true)),
      checkPensionImport: () => Promise.resolve(check(true, false)),
    });

    expect(report.status).toBe('ready');
    expect(getReadinessStatusCode(report)).toBe(200);
  });

  test('maps any failed required check to not ready and HTTP 503', async () => {
    const report = await getCoreReadinessReport(NOW, {
      checkDatabase: () => Promise.resolve(check(true)),
      checkDocumentStorage: () => Promise.resolve(check(false)),
      checkPensionImport: () => Promise.resolve(check(true, false)),
    });

    expect(report.status).toBe('not_ready');
    expect(getReadinessStatusCode(report)).toBe(503);
  });

  test('does not let an optional pension import failure affect core status', async () => {
    const report = await getCoreReadinessReport(NOW, {
      checkDatabase: () => Promise.resolve(check(true)),
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
      Promise.reject(new S3ConfigurationError('missing')),
    );
    const connectionFailed = await checkDocumentStorageReadiness(NOW, () =>
      Promise.reject(new Error('offline')),
    );

    expect(notConfigured).toMatchObject({ ready: false, reason: 'not_configured' });
    expect(connectionFailed).toMatchObject({ ready: false, reason: 'connection_failed' });
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
