import '../config/bootWorker';
import { getConfig } from '../config';
import { checkPensionParserHealth } from '../lib/pensionParserClient';
import {
  PENSION_IMPORT_WORKER_NAME,
  WORKER_HEARTBEAT_INTERVAL_MS,
  type WorkerHeartbeatRuntimeStatus,
  upsertWorkerHeartbeat,
} from '../lib/capabilities';
import { evaluateCapability } from '../lib/capabilityRegistry';
import { closeMaintenanceGate, runUnlessMaintenance } from '../lib/maintenanceMode';
import { runPensionImportWorkerTick } from '../routes/pension-imports';
import { queryClient } from '../db/client';

// The worker has nothing to do without a parser; stop with the settings exit code instead of
// polling a service that cannot be reached. It reads documents from the same store as the server
// (QRO_DOCUMENT_STORAGE), so with the filesystem driver it mounts the same directory.
const configured = evaluateCapability('pensionImport');
if (!configured.enabled) {
  console.error(
    '[pension-import-worker] Statement import is not configured: set PENSION_PARSER_URL.',
  );
  process.exit(2);
}

const DEFAULT_IDLE_LOG_INTERVAL_MS = 60_000;

const POLL_INTERVAL_MS = getConfig().pensionImport.workerPollIntervalMs;
let shuttingDown = false;
let lastLogAt = 0;
const runtimeState: {
  status: WorkerHeartbeatRuntimeStatus;
  parserHealthy: boolean;
  parserCheckedAt: Date | null;
  parserError: string | null;
} = {
  status: 'idle',
  parserHealthy: false,
  parserCheckedAt: null,
  parserError: 'Parser health has not been checked yet',
};

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function maybeLogIdle(): void {
  const now = Date.now();
  if (now - lastLogAt < DEFAULT_IDLE_LOG_INTERVAL_MS) return;
  console.log('[PensionImportWorker] waiting for queued imports');
  lastLogAt = now;
}

async function writeWorkerHeartbeat(): Promise<void> {
  const checkedAt = new Date();
  const parserHealth = await checkPensionParserHealth();
  runtimeState.parserHealthy = parserHealth.healthy;
  runtimeState.parserCheckedAt = checkedAt;
  runtimeState.parserError = parserHealth.errorMessage;

  await upsertWorkerHeartbeat({
    workerName: PENSION_IMPORT_WORKER_NAME,
    status: runtimeState.status,
    lastHeartbeatAt: checkedAt,
    parserHealthy: parserHealth.healthy,
    parserCheckedAt: checkedAt,
    parserError: parserHealth.errorMessage,
  });
}

async function runHeartbeatLoop(): Promise<void> {
  while (!shuttingDown) {
    try {
      await writeWorkerHeartbeat();
    } catch (error) {
      console.error('[PensionImportWorker] heartbeat update failed', error);
    }

    if (shuttingDown) break;
    await sleep(WORKER_HEARTBEAT_INTERVAL_MS);
  }

  try {
    await upsertWorkerHeartbeat({
      workerName: PENSION_IMPORT_WORKER_NAME,
      status: 'stopping',
      lastHeartbeatAt: new Date(),
      parserHealthy: runtimeState.parserHealthy,
      parserCheckedAt: runtimeState.parserCheckedAt,
      parserError: runtimeState.parserError,
    });
  } catch (error) {
    console.error('[PensionImportWorker] failed to persist stopping heartbeat', error);
  }
}

async function runProcessingLoop(): Promise<void> {
  console.log('[PensionImportWorker] started', {
    pollIntervalMs: POLL_INTERVAL_MS,
    heartbeatIntervalMs: WORKER_HEARTBEAT_INTERVAL_MS,
  });

  while (!shuttingDown) {
    runtimeState.status = 'processing';
    try {
      // A backup or restore holds maintenance mode: wait for the next tick instead.
      const outcome = await runUnlessMaintenance(runPensionImportWorkerTick);
      if (!outcome.ran) console.log('[PensionImportWorker] paused while a backup or restore runs');
    } catch (error) {
      console.error('[PensionImportWorker] tick failed', error);
    } finally {
      runtimeState.status = shuttingDown ? 'stopping' : 'idle';
    }

    maybeLogIdle();
    if (shuttingDown) break;
    await sleep(POLL_INTERVAL_MS);
  }

  console.log('[PensionImportWorker] stopped');
}

process.on('SIGINT', () => {
  shuttingDown = true;
  runtimeState.status = 'stopping';
});

process.on('SIGTERM', () => {
  shuttingDown = true;
  runtimeState.status = 'stopping';
});

await Promise.all([runHeartbeatLoop(), runProcessingLoop()]);
// Both loops have finished after SIGTERM or SIGINT: close the connections and exit.
await closeMaintenanceGate();
await queryClient.end({ timeout: 5 });
process.exit(0);
