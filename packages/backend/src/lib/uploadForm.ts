import type { Context } from 'hono';
import { HTTP_STATUS } from '../constants/http';
import { MAX_PDF_SIZE_BYTES, PDF_TOO_LARGE_ERROR } from './pdfDocuments';

export const INVALID_UPLOAD_ERROR = 'Invalid upload';

// Multipart framing and the small fields sent with the PDF.
const FORM_OVERHEAD_BYTES = 1_048_576; // 1 MiB

/** The largest request body any route accepts: one PDF at the size limit and its form. */
export const MAX_REQUEST_BODY_BYTES = MAX_PDF_SIZE_BYTES + FORM_OVERHEAD_BYTES;

export type UploadFormResult = { ok: true; form: FormData } | { ok: false; response: Response };

/**
 * Reads a multipart upload. A body declared larger than the PDF limit is refused before it is
 * read; a body that is not a readable form answers 400 `Invalid upload`. Neither the answer nor
 * the log carries the parser's message or a stack trace, which could quote the request.
 */
export async function readUploadForm(c: Context): Promise<UploadFormResult> {
  const declared = Number(c.req.header('Content-Length'));
  if (Number.isFinite(declared) && declared > MAX_REQUEST_BODY_BYTES) {
    return {
      ok: false,
      response: c.json({ error: PDF_TOO_LARGE_ERROR }, HTTP_STATUS.PAYLOAD_TOO_LARGE),
    };
  }

  try {
    return { ok: true, form: await c.req.formData() };
  } catch {
    console.warn('[Warn] refused an upload that is not a readable multipart form');
    return {
      ok: false,
      response: c.json({ error: INVALID_UPLOAD_ERROR }, HTTP_STATUS.BAD_REQUEST),
    };
  }
}
