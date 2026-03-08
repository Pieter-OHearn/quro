import type { AppCapabilities, AppCapabilityReason, AppCapabilityStatus } from '@quro/shared';
import { eq } from 'drizzle-orm';
import { db } from '../db/client';
import { workerHeartbeats } from '../db/schema';

export const PENSION_IMPORT_WORKER_NAME = 'pension-import-worker';
export const WORKER_HEARTBEAT_INTERVAL_MS = 5_000;
const WORKER_HEARTBEAT_STALE_AFTER_MS = 15_000;

const AI_AVAILABLE_MESSAGE = 'AI features are available.';
const AI_DISABLED_MESSAGE =
  'AI features are unavailable. Start the pension import worker to enable AI.';
const AI_DISABLED_PARSER_MESSAGE =
  'AI features are unavailable because the parser service is unhealthy.';
const PENSION_IMPORT_AVAILABLE_MESSAGE = 'AI import is available.';
const PENSION_IMPORT_DISABLED_MESSAGE =
  'AI import is unavailable. Start the pension import worker to use PDF import.';
const PENSION_IMPORT_DISABLED_PARSER_MESSAGE =
  'AI import is unavailable because the parser service is unhealthy.';

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

function buildCapability(
  enabled: boolean,
  message: string,
  checkedAt: Date,
  reason: AppCapabilityReason | null = null,
): AppCapabilityStatus {
  return {
    enabled,
    reason,
    message,
    checkedAt: checkedAt.toISOString(),
  };
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
    return buildCapability(false, PENSION_IMPORT_DISABLED_MESSAGE, now, 'worker_unavailable');
  }

  if (now.getTime() - heartbeat.lastHeartbeatAt.getTime() > WORKER_HEARTBEAT_STALE_AFTER_MS) {
    return buildCapability(false, PENSION_IMPORT_DISABLED_MESSAGE, now, 'worker_stale');
  }

  if (!heartbeat.parserHealthy || heartbeat.parserCheckedAt === null) {
    return buildCapability(false, PENSION_IMPORT_DISABLED_PARSER_MESSAGE, now, 'parser_unhealthy');
  }

  return buildCapability(true, PENSION_IMPORT_AVAILABLE_MESSAGE, now);
}

function toAiCapability(
  pensionStatementImport: AppCapabilityStatus,
  now: Date,
): AppCapabilityStatus {
  if (pensionStatementImport.enabled) {
    return buildCapability(true, AI_AVAILABLE_MESSAGE, now);
  }

  if (pensionStatementImport.reason === 'parser_unhealthy') {
    return buildCapability(false, AI_DISABLED_PARSER_MESSAGE, now, pensionStatementImport.reason);
  }

  return buildCapability(false, AI_DISABLED_MESSAGE, now, pensionStatementImport.reason);
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
  const heartbeat = await getWorkerHeartbeat(PENSION_IMPORT_WORKER_NAME);
  return resolvePensionImportCapabilityFromHeartbeat(heartbeat, now);
}

export async function getAppCapabilities(now = new Date()): Promise<AppCapabilities> {
  const pensionStatementImport = await getPensionStatementImportCapability(now);
  return {
    ai: toAiCapability(pensionStatementImport, now),
    pensionStatementImport,
  };
}
