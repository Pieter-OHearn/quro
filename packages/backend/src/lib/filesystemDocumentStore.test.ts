import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { InvalidDocumentKeyError, isValidDocumentKey } from './documentStore';
import {
  createFilesystemDocumentStore,
  DocumentDirectoryError,
  resolveDocumentPath,
} from './filesystemDocumentStore';

const PDF = new TextEncoder().encode('%PDF-1.4\n%synthetic\n');
const KEY = 'users/7/pensions/3/annual-statements/11/0f8fad5b-d9cb-469f-a165-70867728950e.pdf';

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'quro-fs-store-'));
});

afterEach(() => {
  chmodSync(root, 0o700);
  rmSync(root, { recursive: true, force: true });
});

describe('filesystem document store', () => {
  test('stores a document at its key as a relative path under the directory', async () => {
    const store = createFilesystemDocumentStore(root);
    await store.put(KEY, PDF);

    const path = join(root, ...KEY.split('/'));
    expect(new Uint8Array(await Bun.file(path).arrayBuffer())).toEqual(PDF);
    expect(await store.get(KEY)).toEqual(Buffer.from(PDF));
    expect(store.driver).toBe('filesystem');
  });

  test('writes files for the owner only and leaves no temporary file behind', async () => {
    const store = createFilesystemDocumentStore(root);
    await store.put(KEY, PDF);

    const path = join(root, ...KEY.split('/'));
    expect(statSync(path).mode & 0o777).toBe(0o600);
    expect(statSync(join(root, 'users')).mode & 0o077).toBe(0);
    expect(readdirSync(join(path, '..'))).toEqual([KEY.split('/').at(-1)!]);
  });

  test('replaces an object stored under the same key', async () => {
    const store = createFilesystemDocumentStore(root);
    await store.put(KEY, PDF);
    await store.put(KEY, new TextEncoder().encode('%PDF-1.7 replaced'));
    expect((await store.get(KEY))?.toString()).toBe('%PDF-1.7 replaced');
  });

  test('reads a missing document as null and deletes it without error', async () => {
    const store = createFilesystemDocumentStore(root);
    expect(await store.get(KEY)).toBeNull();
    await store.delete(KEY);
    // A parent that is a file, not a directory, is a missing document as well.
    writeFileSync(join(root, 'users'), 'not a directory');
    expect(await store.get(KEY)).toBeNull();
    await store.delete(KEY);
  });

  test('deletes documents and reports each key it removed', async () => {
    const store = createFilesystemDocumentStore(root);
    const other = 'users/7/salary/payslips/4/a.pdf';
    await store.put(KEY, PDF);
    await store.put(other, PDF);

    await store.delete(KEY);
    expect(existsSync(join(root, ...KEY.split('/')))).toBe(false);

    const result = await store.deleteMany([other, 'users/7/never-stored.pdf', other]);
    expect(result).toEqual({
      deletedKeys: [other, 'users/7/never-stored.pdf'],
      failedKeys: [],
    });
    expect(await store.get(other)).toBeNull();
  });

  test('keeps keys it could not delete for a retry', async () => {
    const store = createFilesystemDocumentStore(root);
    await store.put(KEY, PDF);
    const original = console.error;
    console.error = () => undefined;
    try {
      const result = await store.deleteMany([KEY, '../outside.pdf']);
      expect(result).toEqual({ deletedKeys: [KEY], failedKeys: ['../outside.pdf'] });
    } finally {
      console.error = original;
    }
  });

  test('check passes for a writable directory and fails for a missing or unwritable one', async () => {
    await createFilesystemDocumentStore(root).check();

    const missing = createFilesystemDocumentStore(join(root, 'not-mounted'));
    await expect(missing.check()).rejects.toBeInstanceOf(DocumentDirectoryError);

    const file = join(root, 'file');
    writeFileSync(file, '');
    await expect(createFilesystemDocumentStore(file).check()).rejects.toBeInstanceOf(
      DocumentDirectoryError,
    );

    if (process.getuid?.() !== 0) {
      chmodSync(root, 0o500);
      await expect(createFilesystemDocumentStore(root).check()).rejects.toBeInstanceOf(
        DocumentDirectoryError,
      );
    }
  });

  test('never creates the documents directory itself', async () => {
    const missingRoot = join(root, 'not-mounted');
    const store = createFilesystemDocumentStore(missingRoot);
    await expect(store.put(KEY, PDF)).rejects.toBeInstanceOf(DocumentDirectoryError);
    expect(existsSync(missingRoot)).toBe(false);
  });
});

describe('document keys', () => {
  const UNSAFE = [
    '',
    '/etc/passwd',
    '../outside.pdf',
    'users/../../outside.pdf',
    'users/./7/a.pdf',
    'users//7/a.pdf',
    'users/7/',
    'users\\7\\a.pdf',
    'users/7/.hidden.pdf',
    '.migrate-from-s3/objects/a.pdf',
    'users/7/a\u0000.pdf',
    'users/7/a b.pdf',
    `users/${'a'.repeat(1100)}.pdf`,
  ];

  test.each(UNSAFE.map((key) => [JSON.stringify(key), key]))(
    'refuses %s before touching the filesystem',
    async (_label, key) => {
      expect(isValidDocumentKey(key)).toBe(false);
      expect(() => resolveDocumentPath(root, key)).toThrow(InvalidDocumentKeyError);
      const store = createFilesystemDocumentStore(join(root, 'store'));
      mkdirSync(join(root, 'store'));
      await expect(store.put(key, PDF)).rejects.toBeInstanceOf(InvalidDocumentKeyError);
      await expect(store.get(key)).rejects.toBeInstanceOf(InvalidDocumentKeyError);
      expect(readdirSync(join(root, 'store'))).toEqual([]);
    },
  );

  test('accepts every key the application builds', () => {
    for (const key of [
      KEY,
      'users/12/salary/payslips/5/0f8fad5b-d9cb-469f-a165-70867728950e.pdf',
      'users/12/pensions/4/imports/0f8fad5b-d9cb-469f-a165-70867728950e.pdf',
    ]) {
      expect(isValidDocumentKey(key)).toBe(true);
      expect(resolveDocumentPath(root, key)).toBe(join(root, ...key.split('/')));
    }
  });
});
