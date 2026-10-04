import { AsyncLocalStorage } from 'node:async_hooks';
import { MINUTE_MS } from '../constants/time';

export const UPSTREAM_TIMEOUT_MS = 15_000;
const SCHEDULED_JOB_TIMEOUT_MINUTES = 5;
export const SCHEDULED_JOB_TIMEOUT_MS = SCHEDULED_JOB_TIMEOUT_MINUTES * MINUTE_MS;
export const DEADLINE_GRACE_MS = 30_000;
export class HardDeadlineError extends Error {
  constructor() {
    super('Scheduled job cleanup grace period exceeded');
  }
}
type WorkScope = {
  signal: AbortSignal;
  pending: Set<Promise<unknown>>;
  database?: object;
  cleanup: Set<() => Promise<void>>;
};
export function currentWorkDatabase(): object | undefined {
  return workScope.getStore()?.database;
}
const workScope = new AsyncLocalStorage<WorkScope>();

export function runFailureCleanup<T>(run: () => Promise<T>): Promise<T> {
  const parent = workScope.getStore();
  if (!parent?.signal.aborted) return run();
  const cleanup: WorkScope = {
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    database: parent.database,
    pending: parent.pending,
    cleanup: new Set(),
  };
  const pending = workScope.run(cleanup, run);
  parent.pending.add(pending);
  return pending.finally(() => parent.pending.delete(pending));
}

export function registerDeadlineCleanup(run: () => Promise<void>): () => void {
  const scope = workScope.getStore();
  if (!scope) return () => {};
  scope.cleanup.add(run);
  return () => scope.cleanup.delete(run);
}

export function trackWork<T>(pending: Promise<T>): Promise<T> {
  const scope = workScope.getStore();
  if (!scope) return pending;
  scope.pending.add(pending);
  return pending.finally(() => scope.pending.delete(pending));
}

export function currentWorkSignal(): AbortSignal | undefined {
  return workScope.getStore()?.signal;
}

export function checkWorkDeadline(): void {
  workScope.getStore()?.signal.throwIfAborted();
}

export function upstreamSignal(timeoutMs = UPSTREAM_TIMEOUT_MS): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs);
  const parent = workScope.getStore()?.signal;
  return parent ? AbortSignal.any([parent, timeout]) : timeout;
}

// Only race isolated provider reads or timers. Never detach application writes.
// Late provider results stay inside this promise and cannot reach its caller.
export async function abortableRead<T>(signal: AbortSignal, read: () => Promise<T>): Promise<T> {
  signal.throwIfAborted();
  let onAbort: () => void = () => {};
  const aborted = new Promise<never>((_resolve, reject) => {
    onAbort = () => reject(signal.reason);
    signal.addEventListener('abort', onAbort, { once: true });
  });
  try {
    const result = await Promise.race([read(), aborted]);
    signal.throwIfAborted();
    return result;
  } finally {
    signal.removeEventListener('abort', onAbort);
  }
}

type DeadlineOptions = {
  graceMs?: number;
  database?: object;
  destroy?: () => Promise<void>;
};

export async function withWorkDeadline<T>(
  timeoutMs: number,
  run: () => Promise<T>,
  options: DeadlineOptions = {},
): Promise<T> {
  const controller = new AbortController();
  const scope: WorkScope = {
    signal: controller.signal,
    pending: new Set(),
    database: options.database,
    cleanup: new Set(),
  };
  let graceTimer: ReturnType<typeof setTimeout> | undefined;
  let rejectHard: (error: unknown) => void = () => {};
  const hardDeadline = new Promise<never>((_resolve, reject) => {
    rejectHard = reject;
  });
  const timer = setTimeout(() => {
    controller.abort(new DOMException('Scheduled job deadline exceeded', 'TimeoutError'));
    for (const cleanup of scope.cleanup) {
      void workScope
        .run(scope, () => runFailureCleanup(cleanup))
        .catch((error: unknown) => {
          console.error('[scheduler] Failed to record deadline status', error);
        });
    }
    graceTimer = setTimeout(() => {
      void (async () => {
        try {
          await options.destroy?.();
        } catch (error) {
          console.error('[scheduler] Failed to destroy expired job connections', error);
        } finally {
          rejectHard(new HardDeadlineError());
        }
      })();
    }, options.graceMs ?? DEADLINE_GRACE_MS);
  }, timeoutMs);
  const work = workScope.run(scope, async () => {
    try {
      const result = await run();
      checkWorkDeadline();
      return result;
    } finally {
      controller.abort(new DOMException('Scheduled job scope closed', 'AbortError'));
      await Promise.allSettled([...scope.pending]);
    }
  });
  try {
    return await Promise.race([work, hardDeadline]);
  } finally {
    clearTimeout(timer);
    clearTimeout(graceTimer);
  }
}
