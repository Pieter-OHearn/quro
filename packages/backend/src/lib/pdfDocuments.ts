import { randomUUID } from 'node:crypto';
import { HTTPException } from 'hono/http-exception';
import { deleteS3Object, uploadS3Object } from './s3';

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

export async function uploadPdfFile(params: {
  key: string;
  file: File;
  fallbackBaseName: string;
}): Promise<{ fileName: string; sizeBytes: number; uploadedAt: Date }> {
  const bytes = Buffer.from(await params.file.arrayBuffer());

  if (bytes.length < PDF_MAGIC.length || !bytes.subarray(0, PDF_MAGIC.length).equals(PDF_MAGIC)) {
    throw new HTTPException(400, { message: 'Uploaded file is not a valid PDF' });
  }

  await uploadS3Object({
    key: params.key,
    body: bytes,
    contentType: PDF_MIME_TYPE,
  });

  return {
    fileName: normalizePdfFileName(params.file.name, params.fallbackBaseName),
    sizeBytes: bytes.byteLength,
    uploadedAt: new Date(),
  };
}

export async function deleteStoredPdfSafely(storageKey: string, context: string): Promise<void> {
  try {
    await deleteS3Object({ key: storageKey });
  } catch (error) {
    console.error(`Failed to delete ${context} from storage`, {
      storageKey,
      error,
    });
  }
}

export function isS3NotFoundError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const maybeError = error as { name?: unknown; Code?: unknown; code?: unknown };
  const values = [maybeError.name, maybeError.Code, maybeError.code].map((value) =>
    String(value ?? ''),
  );
  return values.includes('NoSuchKey') || values.includes('NotFound');
}
