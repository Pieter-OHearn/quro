import type { ObjectDeletionResult } from './documentStore';
import { log, errorFields } from './logger';

const S3_DELETE_BATCH_SIZE = 1000;

export async function deleteObjectsInBatches(
  keys: readonly string[],
  removeBatch: (keys: string[]) => Promise<readonly string[]>,
): Promise<ObjectDeletionResult> {
  const uniqueKeys = [...new Set(keys)];
  const deletedKeys: string[] = [];
  const failedKeys: string[] = [];
  for (let offset = 0; offset < uniqueKeys.length; offset += S3_DELETE_BATCH_SIZE) {
    const batch = uniqueKeys.slice(offset, offset + S3_DELETE_BATCH_SIZE);
    try {
      const failures = new Set(await removeBatch(batch));
      deletedKeys.push(...batch.filter((key) => !failures.has(key)));
      failedKeys.push(...batch.filter((key) => failures.has(key)));
    } catch (error) {
      log.error('s3.delete_batch_failed', { keys: batch.length, ...errorFields(error) });
      failedKeys.push(...batch);
    }
  }
  return { deletedKeys, failedKeys };
}
