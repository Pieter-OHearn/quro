import { sql } from 'drizzle-orm';
import { db } from '../db/client';
import { getPensionStatementImportCapability } from './capabilities';
import { checkS3Readiness, S3ConfigurationError } from './s3';

const READINESS_TIMEOUT_MS = 2_000;

export type ReadinessCheck = {
  required: boolean;
  ready: boolean;
  reason: string | null;
  message: string;
  checkedAt: string;
};

export type CoreReadinessReport = {
  status: 'ready' | 'not_ready';
  checkedAt: string;
  checks: {
    database: ReadinessCheck;
    documentStorage: ReadinessCheck;
  };
  optional: {
    pensionImport: ReadinessCheck;
  };
};

export type PensionImportReadinessReport = {
  status: 'ready' | 'not_ready';
  checkedAt: string;
  checks: {
    pensionImport: ReadinessCheck;
  };
};

type CheckPensionImportOptions = {
  skipDueToDatabaseFailure?: boolean;
};

type ReadinessDependencies = {
  checkDatabase: (now: Date) => Promise<ReadinessCheck>;
  checkDocumentStorage: (now: Date) => Promise<ReadinessCheck>;
  checkPensionImport: (now: Date, options?: CheckPensionImportOptions) => Promise<ReadinessCheck>;
};

function createReadinessCheck(
  now: Date,
  required: boolean,
  ready: boolean,
  message: string,
  reason: string | null = null,
): ReadinessCheck {
  return {
    required,
    ready,
    reason,
    message,
    checkedAt: now.toISOString(),
  };
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`${label} timed out`)), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

export function getHealthReport(now = new Date()) {
  return {
    status: 'ok' as const,
    checkedAt: now.toISOString(),
  };
}

export async function checkDatabaseReadiness(now = new Date()): Promise<ReadinessCheck> {
  try {
    await withTimeout(db.execute(sql`select 1`), READINESS_TIMEOUT_MS, 'Database readiness check');
    return createReadinessCheck(now, true, true, 'Database connection succeeded.');
  } catch {
    return createReadinessCheck(
      now,
      true,
      false,
      'Database connection failed.',
      'connection_failed',
    );
  }
}

export async function checkDocumentStorageReadiness(now = new Date()): Promise<ReadinessCheck> {
  try {
    await withTimeout(checkS3Readiness(), READINESS_TIMEOUT_MS, 'Document storage readiness check');
    return createReadinessCheck(now, true, true, 'Document storage is reachable.');
  } catch (error) {
    if (error instanceof S3ConfigurationError) {
      return createReadinessCheck(
        now,
        true,
        false,
        'Document storage is not configured.',
        'not_configured',
      );
    }

    return createReadinessCheck(
      now,
      true,
      false,
      'Document storage is not reachable.',
      'connection_failed',
    );
  }
}

export async function checkPensionImportReadiness(
  now = new Date(),
  options: CheckPensionImportOptions = {},
): Promise<ReadinessCheck> {
  if (options.skipDueToDatabaseFailure) {
    return createReadinessCheck(
      now,
      false,
      false,
      'Pension import readiness could not be checked because the database is unavailable.',
      'database_unavailable',
    );
  }

  try {
    const capability = await withTimeout(
      getPensionStatementImportCapability(now),
      READINESS_TIMEOUT_MS,
      'Pension import readiness check',
    );

    return createReadinessCheck(
      now,
      false,
      capability.enabled,
      capability.message,
      capability.reason,
    );
  } catch {
    return createReadinessCheck(
      now,
      false,
      false,
      'Pension import readiness could not be checked because the database is unavailable.',
      'database_unavailable',
    );
  }
}

function resolveStatus(checks: ReadinessCheck[]): CoreReadinessReport['status'] {
  return checks.every((check) => check.ready) ? 'ready' : 'not_ready';
}

export async function getCoreReadinessReport(
  now = new Date(),
  overrides: Partial<ReadinessDependencies> = {},
): Promise<CoreReadinessReport> {
  const dependencies: ReadinessDependencies = {
    checkDatabase: overrides.checkDatabase ?? checkDatabaseReadiness,
    checkDocumentStorage: overrides.checkDocumentStorage ?? checkDocumentStorageReadiness,
    checkPensionImport: overrides.checkPensionImport ?? checkPensionImportReadiness,
  };

  const [database, documentStorage] = await Promise.all([
    dependencies.checkDatabase(now),
    dependencies.checkDocumentStorage(now),
  ]);
  const pensionImport = await dependencies.checkPensionImport(now, {
    skipDueToDatabaseFailure: !database.ready,
  });

  return {
    status: resolveStatus([database, documentStorage]),
    checkedAt: now.toISOString(),
    checks: {
      database,
      documentStorage,
    },
    optional: {
      pensionImport,
    },
  };
}

export async function getPensionImportReadinessReport(
  now = new Date(),
  overrides: Partial<ReadinessDependencies> = {},
): Promise<PensionImportReadinessReport> {
  const checkPensionImport = overrides.checkPensionImport ?? checkPensionImportReadiness;
  const pensionImport = await checkPensionImport(now);

  return {
    status: resolveStatus([pensionImport]),
    checkedAt: now.toISOString(),
    checks: {
      pensionImport,
    },
  };
}

export function getReadinessStatusCode(
  report: CoreReadinessReport | PensionImportReadinessReport,
): 200 | 503 {
  return report.status === 'ready' ? 200 : 503;
}
