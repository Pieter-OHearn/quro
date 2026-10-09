import type { DocumentStore } from '../lib/documentStore';

/**
 * An in-memory document store for tests that inspect what was stored or make deletions fail.
 * Install it by replacing `getDocumentStore` in `lib/documentStorage` (see providerMocks.ts).
 */
export function createMemoryDocumentStore() {
  const objects = new Map<string, Uint8Array>();
  /** Keys whose deletion fails, as a store outage would. */
  const failedDeletionKeys = new Set<string>();
  /** Every `deleteMany` call, in order. */
  const deletionRequests: string[][] = [];

  const store: DocumentStore = {
    driver: 'filesystem',
    put: (key, body) => {
      objects.set(key, new Uint8Array(body));
      return Promise.resolve();
    },
    get: (key) => {
      const existing = objects.get(key);
      return Promise.resolve(existing ? Buffer.from(existing) : null);
    },
    delete: (key) => {
      objects.delete(key);
      return Promise.resolve();
    },
    deleteMany: (keys) => {
      deletionRequests.push([...keys]);
      const deletedKeys = [...new Set(keys)].filter((key) => !failedDeletionKeys.has(key));
      for (const key of deletedKeys) objects.delete(key);
      const failedKeys = keys.filter((key) => failedDeletionKeys.has(key));
      return Promise.resolve({ deletedKeys, failedKeys });
    },
    check: () => Promise.resolve(),
  };

  return { store, objects, failedDeletionKeys, deletionRequests };
}
