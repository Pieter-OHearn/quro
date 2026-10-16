import { AsyncLocalStorage } from 'node:async_hooks';

// The identifier of the request being handled, so every log line written while serving it carries
// the same `requestId` without each caller passing it along.

const storage = new AsyncLocalStorage<{ requestId: string }>();

export function runWithRequestId<T>(requestId: string, work: () => T): T {
  return storage.run({ requestId }, work);
}

export function currentRequestId(): string | undefined {
  return storage.getStore()?.requestId;
}
