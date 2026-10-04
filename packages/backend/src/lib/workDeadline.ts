import { AsyncLocalStorage } from 'node:async_hooks';
import { MINUTE_MS } from '../constants/time';

export const UPSTREAM_TIMEOUT_MS = 15_000;
const SCHEDULED_JOB_TIMEOUT_MINUTES = 5;
export const SCHEDULED_JOB_TIMEOUT_MS = SCHEDULED_JOB_TIMEOUT_MINUTES * MINUTE_MS;
type WorkScope = { signal: AbortSignal; pending: Set<Promise<unknown>> };
const workScope = new AsyncLocalStorage<WorkScope>();

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

export async function withWorkDeadline<T>(timeoutMs: number, run: () => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(new DOMException('Scheduled job deadline exceeded', 'TimeoutError')),
    timeoutMs,
  );
  try {
    const scope: WorkScope = { signal: controller.signal, pending: new Set() };
    return await workScope.run(scope, async () => {
      try {
        const result = await run();
        checkWorkDeadline();
        return result;
      } finally {
        // Close the scope before draining. Detached continuations cannot start
        // new queries, and in-flight queries/transactions retain the job lease.
        controller.abort(new DOMException('Scheduled job scope closed', 'AbortError'));
        await Promise.allSettled([...scope.pending]);
      }
    });
  } finally {
    clearTimeout(timer);
  }
}
