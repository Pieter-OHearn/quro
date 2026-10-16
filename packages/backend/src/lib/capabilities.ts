import type {
  AppCapabilities,
  AppCapabilityLifecycle,
  AppCapabilityReason,
  AppCapabilityStatus,
} from '@quro/shared';
import { eq } from 'drizzle-orm';
import { db } from '../db/client';
import { workerHeartbeats } from '../db/schema';
import { evaluateCapability, getCapabilityDefinition } from './capabilityRegistry';

export const PENSION_IMPORT_WORKER_NAME = 'pension-import-worker';
export const WORKER_HEARTBEAT_INTERVAL_MS = 5_000;
const WORKER_HEARTBEAT_STALE_AFTER_MS = 15_000;

const PENSION_IMPORT_AVAILABLE_MESSAGE = 'Statement import is available.';
const PENSION_IMPORT_DISABLED_MESSAGE =
  'Statement import is set up on this server, but its import worker is not running.';
const PENSION_IMPORT_DISABLED_PARSER_MESSAGE =
  'Statement import is set up on this server, but its parser is not responding.';

const ACTIVE_WORKER_STATUSES = new Set<WorkerHeartbeatRuntimeStatus>(['idle', 'processing']);

export type WorkerHeartbeatRuntimeStatus = 'idle' | 'processing' | 'stopping';

type WorkerHeartbeatUpsertInput = {
  workerName: string;
  status: WorkerHeartbeatRuntimeStatus;
  lastHeartbeatAt: Date;
  parserHealthy: boolean;
  parserCheckedAt: Date | null;
  parserError: string | null;
};

const PENSION_IMPORT_LIFECYCLE = getCapabilityDefinition('pensionImport').lifecycle;

function buildCapability(
  enabled: boolean,
  message: string,
  checkedAt: Date,
  reason: AppCapabilityReason | null = null,
  lifecycle: AppCapabilityLifecycle = 'stable',
): AppCapabilityStatus {
  return {
    enabled,
    reason,
    message,
    lifecycle,
    checkedAt: checkedAt.toISOString(),
  };
}

function pensionImportCapability(
  enabled: boolean,
  message: string,
  checkedAt: Date,
  reason: AppCapabilityReason | null = null,
): AppCapabilityStatus {
  return buildCapability(enabled, message, checkedAt, reason, PENSION_IMPORT_LIFECYCLE);
}

async function getWorkerHeartbeat(workerName: string) {
  const [heartbeat] = await db
    .select()
    .from(workerHeartbeats)
    .where(eq(workerHeartbeats.workerName, workerName));
  return heartbeat ?? null;
}

function resolvePensionImportCapabilityFromHeartbeat(
  heartbeat: Awaited<ReturnType<typeof getWorkerHeartbeat>>,
  now: Date,
): AppCapabilityStatus {
  if (!heartbeat || !ACTIVE_WORKER_STATUSES.has(heartbeat.status as WorkerHeartbeatRuntimeStatus)) {
    return pensionImportCapability(
      false,
      PENSION_IMPORT_DISABLED_MESSAGE,
      now,
      'worker_unavailable',
    );
  }

  if (now.getTime() - heartbeat.lastHeartbeatAt.getTime() > WORKER_HEARTBEAT_STALE_AFTER_MS) {
    return pensionImportCapability(false, PENSION_IMPORT_DISABLED_MESSAGE, now, 'worker_stale');
  }

  if (!heartbeat.parserHealthy || heartbeat.parserCheckedAt === null) {
    return pensionImportCapability(
      false,
      PENSION_IMPORT_DISABLED_PARSER_MESSAGE,
      now,
      'parser_unhealthy',
    );
  }

  return pensionImportCapability(true, PENSION_IMPORT_AVAILABLE_MESSAGE, now);
}

// Document storage is part of the core: the filesystem store needs no configuration, and the
// S3 store is checked at startup. Readiness reports whether the configured store is usable.
const DOCUMENTS_AVAILABLE_MESSAGE = 'Document storage is available.';

function getConfiguredCapability(id: 'bunq', now: Date): AppCapabilityStatus {
  const { enabled, message, reason } = evaluateCapability(id);
  return buildCapability(enabled, message, now, reason, getCapabilityDefinition(id).lifecycle);
}

export async function upsertWorkerHeartbeat(input: WorkerHeartbeatUpsertInput): Promise<void> {
  await db
    .insert(workerHeartbeats)
    .values({
      workerName: input.workerName,
      status: input.status,
      lastHeartbeatAt: input.lastHeartbeatAt,
      parserHealthy: input.parserHealthy,
      parserCheckedAt: input.parserCheckedAt,
      parserError: input.parserError,
      createdAt: new Date(),
      updatedAt: input.lastHeartbeatAt,
    })
    .onConflictDoUpdate({
      target: workerHeartbeats.workerName,
      set: {
        status: input.status,
        lastHeartbeatAt: input.lastHeartbeatAt,
        parserHealthy: input.parserHealthy,
        parserCheckedAt: input.parserCheckedAt,
        parserError: input.parserError,
        updatedAt: input.lastHeartbeatAt,
      },
    });
}

export async function getPensionStatementImportCapability(
  now = new Date(),
): Promise<AppCapabilityStatus> {
  const configured = evaluateCapability('pensionImport');
  if (!configured.enabled) {
    return pensionImportCapability(false, configured.message, now, 'not_configured');
  }
  const heartbeat = await getWorkerHeartbeat(PENSION_IMPORT_WORKER_NAME);
  return resolvePensionImportCapabilityFromHeartbeat(heartbeat, now);
}

export async function getAppCapabilities(now = new Date()): Promise<AppCapabilities> {
  return {
    pensionStatementImport: await getPensionStatementImportCapability(now),
    bunq: getConfiguredCapability('bunq', now),
    documents: buildCapability(true, DOCUMENTS_AVAILABLE_MESSAGE, now),
  };
}
