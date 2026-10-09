import type { ObjectDeletionResult } from './documentStore';

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
      console.error('Failed to delete S3 object batch; retaining keys for retry', error);
      failedKeys.push(...batch);
    }
  }
  return { deletedKeys, failedKeys };
}
