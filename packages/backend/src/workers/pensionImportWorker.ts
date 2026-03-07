import { checkPensionParserHealth } from '../lib/pensionParserClient';
import {
  PENSION_IMPORT_WORKER_NAME,
  WORKER_HEARTBEAT_INTERVAL_MS,
  type WorkerHeartbeatRuntimeStatus,
  upsertWorkerHeartbeat,
} from '../lib/capabilities';
import { runPensionImportWorkerTick } from '../routes/pension-imports';

const DEFAULT_POLL_INTERVAL_MS = 3_000;
const DEFAULT_IDLE_LOG_INTERVAL_MS = 60_000;

function readPollIntervalMs(): number {
  const parsed = Number.parseInt(process.env.IMPORT_WORKER_POLL_INTERVAL_MS ?? '', 10);
  if (Number.isFinite(parsed) && parsed >= 500) return parsed;
  return DEFAULT_POLL_INTERVAL_MS;
}

const POLL_INTERVAL_MS = readPollIntervalMs();
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
      await runPensionImportWorkerTick();
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
