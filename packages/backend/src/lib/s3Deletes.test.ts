import { expect, test } from 'bun:test';
import { deleteObjectsInBatches } from './s3Deletes';

test('attempts later batches after a request fails and returns keys to retry', async () => {
  const keys = Array.from({ length: 2001 }, (_, index) => `document-${index}`);
  const batches: string[][] = [];
  const originalError = console.error;
  console.error = () => {};
  try {
    const result = await deleteObjectsInBatches(keys, (batch) => {
      batches.push(batch);
      if (batches.length === 1) return Promise.reject(new Error('S3 unavailable'));
      return Promise.resolve([]);
    });
    expect(batches.map((batch) => batch.length)).toEqual([1000, 1000, 1]);
    expect(result.failedKeys).toEqual(keys.slice(0, 1000));
    expect(result.deletedKeys).toEqual(keys.slice(1000));
    const retry = await deleteObjectsInBatches(result.failedKeys, () => Promise.resolve([]));
    expect(retry.deletedKeys).toEqual(result.failedKeys);
    expect(retry.failedKeys).toEqual([]);
  } finally {
    console.error = originalError;
  }
});

test('retains only per-object failures and deduplicates input keys', async () => {
  const batches: string[][] = [];
  const result = await deleteObjectsInBatches(['first', 'second', 'first'], (batch) => {
    batches.push(batch);
    return Promise.resolve(['second']);
  });
  expect(batches).toEqual([['first', 'second']]);
  expect(result).toEqual({ deletedKeys: ['first'], failedKeys: ['second'] });
});
