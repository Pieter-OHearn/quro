import { useEffect, useState } from 'react';
import type { PdfDocument } from '@quro/shared';
import { api } from './api';

const MAX_PDF_SIZE_BYTES = 20 * 1024 * 1024;
const KILOBYTE = 1024;
const MEGABYTE = 1024 * 1024;

export type ApiPdfDocument = Omit<PdfDocument, 'sizeBytes'> & {
  sizeBytes: number | string | null | undefined;
};

const toNumber = (value: number | string | null | undefined): number => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

export function normalizePdfDocument(
  document: ApiPdfDocument | null | undefined,
): PdfDocument | null {
  if (!document) return null;

  return {
    fileName: typeof document.fileName === 'string' ? document.fileName : 'document.pdf',
    mimeType: 'application/pdf',
    sizeBytes: toNumber(document.sizeBytes),
    uploadedAt:
      typeof document.uploadedAt === 'string' ? document.uploadedAt : new Date().toISOString(),
  };
}

export function formatPdfFileSize(bytes: number): string {
  if (bytes < KILOBYTE) return `${bytes} B`;
  if (bytes < MEGABYTE) return `${(bytes / KILOBYTE).toFixed(1)} KB`;
  return `${(bytes / MEGABYTE).toFixed(1)} MB`;
}

export function validatePdfFile(file: File): string {
  const hasPdfExtension = file.name.toLowerCase().endsWith('.pdf');
  const allowedMimeType = file.type === 'application/pdf' || file.type === '';

  if (!hasPdfExtension || !allowedMimeType) return 'Only PDF files are allowed';
  if (file.size <= 0) return 'Uploaded file is empty';
  if (file.size > MAX_PDF_SIZE_BYTES) return 'PDF exceeds 20MB limit';
  return '';
}

export function buildApiDownloadUrl(path: string): string {
  return `${api.defaults.baseURL}${path}`;
}

export function readApiErrorMessage(error: unknown): string | null {
  if (typeof error !== 'object' || error === null) return null;
  const responseError = (error as { response?: { data?: { error?: unknown } } }).response?.data
    ?.error;
  return typeof responseError === 'string' ? responseError : null;
}

export function resolveApiErrorMessage(error: unknown, fallback: string): string {
  const apiError = readApiErrorMessage(error);
  if (apiError) return apiError;
  if (error instanceof Error && error.message.trim()) return error.message;
  return fallback;
}

export class PdfAttachmentUploadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PdfAttachmentUploadError';
  }
}

type UsePdfAttachmentStateArgs<TDocument extends PdfDocument> = {
  initialDocument: TDocument | null;
  uploadFile: (ownerId: number, file: File) => Promise<TDocument>;
  deleteFile?: (ownerId: number) => Promise<void>;
  isUploading: boolean;
  isDeleting?: boolean;
  uploadErrorMessage: string;
  deleteErrorMessage?: string;
};

export function usePdfAttachmentState<TDocument extends PdfDocument>({
  initialDocument,
  uploadFile,
  deleteFile,
  isUploading,
  isDeleting,
  uploadErrorMessage,
  deleteErrorMessage,
}: UsePdfAttachmentStateArgs<TDocument>) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState('');
  const [document, setDocument] = useState<TDocument | null>(initialDocument);

  useEffect(() => {
    setDocument(initialDocument);
  }, [initialDocument]);

  const busy = isUploading || Boolean(isDeleting);

  const handleFileSelect = (file: File | null): void => {
    if (!file) {
      setSelectedFile(null);
      setFileError('');
      return;
    }

    const validationError = validatePdfFile(file);
    if (validationError) {
      setSelectedFile(null);
      setFileError(validationError);
      return;
    }

    setSelectedFile(file);
    setFileError('');
  };

  const clearSelectedFile = (): void => {
    setSelectedFile(null);
    setFileError('');
  };

  const handleRemoveDocument = async (ownerId: number): Promise<void> => {
    if (!document || !deleteFile) return;

    try {
      await deleteFile(ownerId);
      setDocument(null);
      setSelectedFile(null);
      setFileError('');
    } catch (error) {
      setFileError(resolveApiErrorMessage(error, deleteErrorMessage ?? 'Failed to remove PDF'));
    }
  };

  const uploadSelectedFile = async (ownerId: number): Promise<void> => {
    if (!selectedFile) return;

    const validationError = validatePdfFile(selectedFile);
    if (validationError) {
      setFileError(validationError);
      throw new PdfAttachmentUploadError(validationError);
    }

    try {
      const uploaded = await uploadFile(ownerId, selectedFile);
      setDocument(uploaded);
      setSelectedFile(null);
      setFileError('');
    } catch (error) {
      const message = resolveApiErrorMessage(error, uploadErrorMessage);
      setFileError(message);
      throw new PdfAttachmentUploadError(message);
    }
  };

  return {
    document,
    selectedFile,
    fileError,
    busy,
    setFileError,
    handleFileSelect,
    clearSelectedFile,
    handleRemoveDocument,
    uploadSelectedFile,
  };
}
