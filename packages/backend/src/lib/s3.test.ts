import { describe, expect, test } from 'bun:test';
import { FAKE_S3_CONNECTION, FakeS3Client } from '../test/fakeS3';
import { createS3DocumentStore } from './s3';

const PDF = new TextEncoder().encode('%PDF-1.4\n%synthetic\n');

function storeWithFake() {
  const fake = new FakeS3Client();
  return { fake, store: createS3DocumentStore(FAKE_S3_CONNECTION, fake.asSender()) };
}

describe('S3 document store', () => {
  test('stores, reads and deletes objects under their key in the configured bucket', async () => {
    const { fake, store } = storeWithFake();
    const key = 'users/1/salary/payslips/2/00000000-0000-4000-8000-000000000001.pdf';

    await store.put(key, PDF);
    expect(fake.objects.get(key)).toEqual(PDF);
    expect(await store.get(key)).toEqual(Buffer.from(PDF));

    await store.delete(key);
    expect(fake.objects.has(key)).toBe(false);
    expect(store.driver).toBe('s3');
  });

  test('reads a missing object as null instead of throwing', async () => {
    const { store } = storeWithFake();
    expect(await store.get('users/1/missing.pdf')).toBeNull();
  });

  test('passes other read errors on', async () => {
    const { fake, store } = storeWithFake();
    fake.objects.set('users/1/a.pdf', PDF);
    fake.failGet = () => Object.assign(new Error('denied'), { name: 'AccessDenied' });
    await expect(store.get('users/1/a.pdf')).rejects.toMatchObject({ name: 'AccessDenied' });
  });

  test('deleteMany reports the keys the store refused, for a retry', async () => {
    const { fake, store } = storeWithFake();
    for (const key of ['a.pdf', 'b.pdf', 'c.pdf']) fake.objects.set(key, PDF);
    fake.failedDeletes.add('b.pdf');
    const original = console.error;
    console.error = () => undefined;
    try {
      const result = await store.deleteMany(['a.pdf', 'b.pdf', 'c.pdf', 'a.pdf']);
      expect(result).toEqual({ deletedKeys: ['a.pdf', 'c.pdf'], failedKeys: ['b.pdf'] });
    } finally {
      console.error = original;
    }
    expect([...fake.objects.keys()]).toEqual(['b.pdf']);
  });

  test('check asks for the bucket and fails when the store cannot be reached', async () => {
    const { fake, store } = storeWithFake();
    await store.check();
    expect(fake.commands).toEqual(['HeadBucket']);

    fake.bucketReachable = false;
    await expect(store.check()).rejects.toMatchObject({ code: 'ECONNREFUSED' });
  });
});
