import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import { createMemoryDocumentStore } from '../test/memoryDocumentStore';

const documents = createMemoryDocumentStore();
const objects = documents.objects;
const realDocumentStorage = { ...(await import('./documentStorage')) };

await mock.module('./documentStorage', () => ({
  ...realDocumentStorage,
  getDocumentStore: () => documents.store,
}));

const { replaceStoredPdfDocument } = await import('./pdfDocuments');

afterAll(async () => {
  await mock.module('./documentStorage', () => realDocumentStorage);
  mock.restore();
});

type Row = { key: string };

const PREVIOUS = { storageKey: 'old.pdf', fileName: 'old.pdf', sizeBytes: 1 } as never;
const ERRORS = { notFound: 'missing', uploadFailed: 'upload', saveFailed: 'save' };

function pdfFile(): File {
  return new File(['%PDF-1.4 test'], 'statement.pdf', { type: 'application/pdf' });
}

function replace(options: {
  persist: (fields: { documentStorageKey: string }) => Promise<Row | undefined>;
  formatRow?: (row: Row) => string | null;
  file?: File;
}) {
  return replaceStoredPdfDocument<Row, string>({
    storageKey: 'new.pdf',
    file: options.file ?? pdfFile(),
    fallbackBaseName: 'doc',
    context: 'test PDF',
    previousDocument: PREVIOUS,
    persist: options.persist,
    formatRow: options.formatRow ?? ((row) => row.key),
    errors: ERRORS,
  });
}

describe('replaceStoredPdfDocument', () => {
  beforeEach(() => {
    objects.clear();
    objects.set('old.pdf', new Uint8Array([1]));
  });

  test('stores the new object and deletes the previous one on success', async () => {
    const result = await replace({
      persist: (f) => Promise.resolve({ key: f.documentStorageKey }),
    });
    expect(result).toEqual({ ok: true, document: 'new.pdf' });
    expect([...objects.keys()]).toEqual(['new.pdf']);
  });

  test('removes the new object when the owning row is missing', async () => {
    const result = await replace({ persist: () => Promise.resolve(undefined) });
    expect(result).toMatchObject({ ok: false, error: 'missing', status: 404 });
    expect([...objects.keys()]).toEqual(['old.pdf']);
  });

  test('removes the new object and keeps the previous one when persisting throws', async () => {
    const spy = console.error;
    console.error = () => {};
    try {
      const result = await replace({ persist: () => Promise.reject(new Error('db down')) });
      expect(result).toMatchObject({ ok: false, error: 'save', status: 500 });
      expect([...objects.keys()]).toEqual(['old.pdf']);
    } finally {
      console.error = spy;
    }
  });

  test('keeps both objects when the saved row cannot be read back', async () => {
    const result = await replace({
      persist: (f) => Promise.resolve({ key: f.documentStorageKey }),
      formatRow: () => null,
    });
    expect(result).toMatchObject({ ok: false, error: 'save', status: 500 });
    expect(objects.has('new.pdf')).toBe(true);
    expect(objects.has('old.pdf')).toBe(true);
  });

  test('rejects a file that is not a PDF without touching the row', async () => {
    const spy = console.error;
    console.error = () => {};
    let persisted = false;
    try {
      const result = await replace({
        file: new File(['nope'], 'x.pdf', { type: 'application/pdf' }),
        persist: () => {
          persisted = true;
          return Promise.resolve(undefined);
        },
      });
      expect(result).toMatchObject({ ok: false, error: 'upload', status: 500 });
      expect(persisted).toBe(false);
    } finally {
      console.error = spy;
    }
  });
});
