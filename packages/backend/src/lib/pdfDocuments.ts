import { randomUUID } from 'node:crypto';
import type { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { HTTP_STATUS } from '../constants/http';
import { getDocumentStore } from './documentStorage';

const PDF_MAGIC = Buffer.from('%PDF', 'ascii');

export const PDF_MIME_TYPE = 'application/pdf' as const;
export const PDF_EXTENSION = '.pdf';
export const MAX_PDF_SIZE_BYTES = 20 * 1024 * 1024;

export const CLEAR_INLINE_PDF_DOCUMENT = {
  documentStorageKey: null,
  documentFileName: null,
  documentSizeBytes: null,
  documentUploadedAt: null,
};

export type InlinePdfDocumentFields = {
  documentStorageKey: string | null;
  documentFileName: string | null;
  documentSizeBytes: number | string | null;
  documentUploadedAt: Date | string | null;
};

export type InlinePdfDocumentRecord = {
  storageKey: string;
  fileName: string;
  mimeType: typeof PDF_MIME_TYPE;
  sizeBytes: number;
  uploadedAt: Date;
};

export type InlinePdfDocumentResponse = Omit<
  InlinePdfDocumentRecord,
  'storageKey' | 'uploadedAt'
> & {
  uploadedAt: string;
};

function toPositiveNumber(value: number | string | null): number {
  if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? value : 0;
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  }
  return 0;
}

function toDate(value: Date | string | null): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value !== 'string') return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function hasPdfExtension(fileName: string): boolean {
  return fileName.trim().toLowerCase().endsWith(PDF_EXTENSION);
}

function isAllowedPdfMimeType(mimeType: string): boolean {
  return mimeType === PDF_MIME_TYPE || mimeType === '';
}

export function normalizePdfFileName(value: string, fallbackBaseName: string): string {
  const trimmed = value.trim();
  const sanitizedBaseName = fallbackBaseName.replaceAll(/[^\w-]+/g, '_') || 'document';
  const sanitizedValue = trimmed.replaceAll(/[^\w.-]+/g, '_');
  if (!sanitizedValue) return `${sanitizedBaseName}${PDF_EXTENSION}`;
  return hasPdfExtension(sanitizedValue) ? sanitizedValue : `${sanitizedValue}${PDF_EXTENSION}`;
}

export function validateUploadedPdf(file: File): { valid: true } | { valid: false; error: string } {
  if (file.size <= 0) return { valid: false, error: 'Uploaded file is empty' };
  if (file.size > MAX_PDF_SIZE_BYTES) return { valid: false, error: 'PDF exceeds 20MB limit' };
  if (!hasPdfExtension(file.name)) return { valid: false, error: 'Only PDF files are allowed' };
  if (!isAllowedPdfMimeType(file.type))
    return { valid: false, error: 'Only PDF files are allowed' };
  return { valid: true };
}

export function asFile(value: unknown): File | null {
  return value instanceof File ? value : null;
}

export function buildPdfStorageKey(params: {
  userId: number;
  pathSegments: Array<string | number>;
}): string {
  return [
    'users',
    String(params.userId),
    ...params.pathSegments.map((segment) => String(segment)),
    `${randomUUID()}${PDF_EXTENSION}`,
  ].join('/');
}

export function readInlinePdfDocument(
  fields: InlinePdfDocumentFields,
): InlinePdfDocumentRecord | null {
  if (
    !fields.documentStorageKey ||
    !fields.documentFileName ||
    fields.documentSizeBytes == null ||
    fields.documentUploadedAt == null
  ) {
    return null;
  }

  const sizeBytes = toPositiveNumber(fields.documentSizeBytes);
  const uploadedAt = toDate(fields.documentUploadedAt);
  if (sizeBytes <= 0 || !uploadedAt) return null;

  return {
    storageKey: fields.documentStorageKey,
    fileName: fields.documentFileName,
    mimeType: PDF_MIME_TYPE,
    sizeBytes,
    uploadedAt,
  };
}

export function formatInlinePdfDocument(
  fields: InlinePdfDocumentFields,
): InlinePdfDocumentResponse | null {
  const document = readInlinePdfDocument(fields);
  if (!document) return null;

  return {
    fileName: document.fileName,
    mimeType: document.mimeType,
    sizeBytes: document.sizeBytes,
    uploadedAt: document.uploadedAt.toISOString(),
  };
}

async function uploadPdfFile(params: {
  key: string;
  file: File;
  fallbackBaseName: string;
}): Promise<{ fileName: string; sizeBytes: number; uploadedAt: Date }> {
  const bytes = Buffer.from(await params.file.arrayBuffer());

  if (bytes.length < PDF_MAGIC.length || !bytes.subarray(0, PDF_MAGIC.length).equals(PDF_MAGIC)) {
    throw new HTTPException(400, { message: 'Uploaded file is not a valid PDF' });
  }

  await getDocumentStore().put(params.key, bytes);

  return {
    fileName: normalizePdfFileName(params.file.name, params.fallbackBaseName),
    sizeBytes: bytes.byteLength,
    uploadedAt: new Date(),
  };
}

export async function deleteStoredPdfSafely(storageKey: string, context: string): Promise<void> {
  try {
    await getDocumentStore().delete(storageKey);
  } catch (error) {
    console.error(`Failed to delete ${context} from storage`, {
      storageKey,
      error,
    });
  }
}

type HttpStatus = (typeof HTTP_STATUS)[keyof typeof HTTP_STATUS];

export type ReplaceStoredPdfResult<TDocument> =
  { ok: true; document: TDocument } | { ok: false; error: string; status: HttpStatus };

// Upload a PDF, point the owning row at it, then drop the document it
// replaces. The freshly uploaded object is removed again if the row is
// missing or the update throws, so the row never points at a missing object.
export async function replaceStoredPdfDocument<TRow, TDocument>(params: {
  storageKey: string;
  file: File;
  fallbackBaseName: string;
  // Names the document in log lines and cleanup, e.g. 'payslip PDF'.
  context: string;
  previousDocument: InlinePdfDocumentRecord | null;
  // Writes the new document fields to the owning row (scoped to its owner)
  // and resolves to the updated row, or undefined when the row is gone.
  persist: (fields: {
    documentStorageKey: string;
    documentFileName: string;
    documentSizeBytes: number;
    documentUploadedAt: Date;
  }) => Promise<TRow | undefined>;
  formatRow: (row: TRow) => TDocument | null;
  errors: { notFound: string; uploadFailed: string; saveFailed: string };
}): Promise<ReplaceStoredPdfResult<TDocument>> {
  const { storageKey, context, previousDocument, errors } = params;
  const internalError = (error: string): ReplaceStoredPdfResult<TDocument> => ({
    ok: false,
    error,
    status: HTTP_STATUS.INTERNAL_SERVER_ERROR,
  });

  const uploaded = await uploadPdfFile({
    key: storageKey,
    file: params.file,
    fallbackBaseName: params.fallbackBaseName,
  }).catch((error: unknown) => {
    console.error(`Failed to upload ${context} to storage`, error);
    return null;
  });
  if (!uploaded) return internalError(errors.uploadFailed);

  let updated: TRow | undefined;
  try {
    updated = await params.persist({
      documentStorageKey: storageKey,
      documentFileName: uploaded.fileName,
      documentSizeBytes: uploaded.sizeBytes,
      documentUploadedAt: uploaded.uploadedAt,
    });
  } catch (error) {
    await deleteStoredPdfSafely(storageKey, context);
    console.error(`Failed to save ${context} metadata`, error);
    return internalError(errors.saveFailed);
  }
  if (!updated) {
    await deleteStoredPdfSafely(storageKey, context);
    return { ok: false, error: errors.notFound, status: HTTP_STATUS.NOT_FOUND };
  }

  // The row now points at the new object, so from here nothing may delete it.
  // The previous object goes only once the new document reads back cleanly.
  const document = params.formatRow(updated);
  if (!document) return internalError(errors.saveFailed);

  if (previousDocument && previousDocument.storageKey !== storageKey) {
    await deleteStoredPdfSafely(previousDocument.storageKey, context);
  }
  return { ok: true, document };
}

// Stream a stored PDF inline, mapping a missing object to 404.
export async function streamStoredPdf(
  c: Context,
  params: {
    document: Pick<InlinePdfDocumentRecord, 'storageKey' | 'fileName'>;
    context: string;
    failureMessage: string;
  },
): Promise<Response> {
  const notFound = () => c.json({ error: 'Document not found' }, HTTP_STATUS.NOT_FOUND);
  try {
    const bytes = await getDocumentStore().get(params.document.storageKey);
    if (!bytes) return notFound();

    return new Response(new Uint8Array(bytes), {
      headers: {
        'Content-Type': PDF_MIME_TYPE,
        'Content-Disposition': `inline; filename="${params.document.fileName}"`,
      },
    });
  } catch (error) {
    console.error(`Failed to download ${params.context}`, error);
    return c.json({ error: params.failureMessage }, HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }
}
