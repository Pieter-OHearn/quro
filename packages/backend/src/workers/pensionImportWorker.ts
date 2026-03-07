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

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function maybeLogHeartbeat(): void {
  const now = Date.now();
  if (now - lastLogAt < DEFAULT_IDLE_LOG_INTERVAL_MS) return;
  console.log('[PensionImportWorker] waiting for queued imports');
  lastLogAt = now;
}

async function runLoop(): Promise<void> {
  console.log('[PensionImportWorker] started', { pollIntervalMs: POLL_INTERVAL_MS });

  while (!shuttingDown) {
    try {
      await runPensionImportWorkerTick();
      maybeLogHeartbeat();
    } catch (error) {
      console.error('[PensionImportWorker] tick failed', error);
    }

    await sleep(POLL_INTERVAL_MS);
  }

  console.log('[PensionImportWorker] stopped');
}

process.on('SIGINT', () => {
  shuttingDown = true;
});

process.on('SIGTERM', () => {
  shuttingDown = true;
});

await runLoop();
