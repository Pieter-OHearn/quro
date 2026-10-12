import { getConfig } from '../config';
import { toNumberOrZero } from './numbers';

const DEFAULT_PARSER_HEALTH_TIMEOUT_MS = 4_000;
const HTTP_SERVICE_UNAVAILABLE = 503;

// What the parser's failure codes mean to the person importing. The parser's own message is
// not stored: an import's error is shown in the app and kept with the import.
const PARSER_FAILURE_MESSAGES: Record<string, string> = {
  invalid_upload: 'The statement is not a PDF file',
  file_too_large: 'The PDF is larger than the parser accepts',
  not_pdf: 'The statement is not a PDF file',
  malformed: 'The PDF is damaged or cannot be read',
  encrypted: 'The PDF is password protected; upload a copy without a password',
  too_many_pages: 'The PDF has more pages than the parser accepts',
  page_too_large: 'A page of the PDF is larger than the parser accepts',
  no_text: 'No text could be read from the PDF',
  ocr_failed: 'Text recognition failed for the PDF',
  resource_limit: 'Reading the PDF needed more memory or CPU than the parser allows',
  timeout: 'Reading the PDF took longer than the parser allows',
  extraction_failed: 'The PDF could not be read',
  model_failed: 'The extraction model did not answer',
};
const PARSER_TIMEOUT_MESSAGE = 'Parsing the statement took longer than allowed';

/** The parser's queue is full; the import can be tried again later. */
export class PensionParserBusyError extends Error {
  constructor() {
    super('The statement parser is busy');
  }
}

async function readParserFailure(response: Response): Promise<string> {
  const body = (await response.json().catch(() => null)) as {
    detail?: { code?: unknown };
  } | null;
  const code = body?.detail?.code;
  if (typeof code === 'string' && code in PARSER_FAILURE_MESSAGES) {
    return PARSER_FAILURE_MESSAGES[code]!;
  }
  return `The statement parser failed with status ${response.status}`;
}

export type PensionParserEvidence = {
  page: number | null;
  snippet: string;
};

export type PensionParserRow = {
  type: 'contribution' | 'fee' | 'annual_statement';
  amount: number;
  taxAmount: number;
  date: string;
  note: string;
  isEmployer: boolean | null;
  confidence: number;
  confidenceLabel: 'high' | 'medium' | 'low';
  evidence: PensionParserEvidence[];
  isDerived: boolean;
};

export type PensionParserResult = {
  statementPeriodStart: string | null;
  statementPeriodEnd: string | null;
  modelName: string | null;
  modelVersion: string | null;
  rows: PensionParserRow[];
};

type ParsePensionStatementInput = {
  fileName: string;
  fileBytes: Uint8Array;
  provider: string;
  currency: string;
  languageHints: string[];
};

function getParserBaseUrl(): string {
  const { parserUrl } = getConfig().pensionImport;
  if (parserUrl === null)
    throw new Error('The statement parser is not configured (PENSION_PARSER_URL)');
  return parserUrl;
}

export type ParserHealthCheckResult = {
  healthy: boolean;
  errorMessage: string | null;
};

function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function toConfidenceLabel(value: unknown): PensionParserRow['confidenceLabel'] {
  if (value === 'high' || value === 'medium') return value;
  return 'low';
}

function normalizeEvidence(value: unknown): PensionParserEvidence[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const row = item as { page?: unknown; snippet?: unknown };
      const page = Number.isInteger(row.page) ? Number(row.page) : null;
      const snippet = typeof row.snippet === 'string' ? row.snippet.trim() : '';
      if (!snippet) return null;
      return { page, snippet };
    })
    .filter((item): item is PensionParserEvidence => item !== null);
}

function normalizeRows(value: unknown): PensionParserRow[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const row = item as Record<string, unknown>;
      const type = row.type;
      if (type !== 'contribution' && type !== 'fee' && type !== 'annual_statement') return null;
      const date = isIsoDate(row.date) ? row.date : null;
      if (!date) return null;

      return {
        type,
        amount: toNumberOrZero(row.amount),
        taxAmount: toNumberOrZero(row.taxAmount),
        date,
        note: typeof row.note === 'string' ? row.note : '',
        isEmployer: typeof row.isEmployer === 'boolean' ? row.isEmployer : null,
        confidence: Math.min(1, Math.max(0, toNumberOrZero(row.confidence))),
        confidenceLabel: toConfidenceLabel(row.confidenceLabel),
        evidence: normalizeEvidence(row.evidence),
        isDerived: Boolean(row.isDerived),
      };
    })
    .filter((item): item is PensionParserRow => item !== null);
}

export async function parsePensionStatement(
  input: ParsePensionStatementInput,
): Promise<PensionParserResult> {
  const controller = new AbortController();
  const timeoutMs = getConfig().pensionImport.parserTimeoutMs;
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const form = new FormData();
    const file = new File([Buffer.from(input.fileBytes)], input.fileName, {
      type: 'application/pdf',
    });
    form.set('file', file);
    form.set('provider', input.provider);
    form.set('currency', input.currency);
    form.set('languageHints', JSON.stringify(input.languageHints));

    const response = await fetch(`${getParserBaseUrl()}/v1/extract`, {
      method: 'POST',
      body: form,
      signal: controller.signal,
    });

    if (response.status === HTTP_SERVICE_UNAVAILABLE) throw new PensionParserBusyError();
    if (!response.ok) throw new Error(await readParserFailure(response));

    const payload = (await response.json()) as Record<string, unknown>;
    return {
      statementPeriodStart: isIsoDate(payload.statementPeriodStart)
        ? payload.statementPeriodStart
        : null,
      statementPeriodEnd: isIsoDate(payload.statementPeriodEnd) ? payload.statementPeriodEnd : null,
      modelName: typeof payload.modelName === 'string' ? payload.modelName : null,
      modelVersion: typeof payload.modelVersion === 'string' ? payload.modelVersion : null,
      rows: normalizeRows(payload.rows),
    };
  } catch (error) {
    // Aborting the request closes the connection, and the parser then stops the extraction.
    if (controller.signal.aborted) throw new Error(PARSER_TIMEOUT_MESSAGE, { cause: error });
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function checkPensionParserHealth(): Promise<ParserHealthCheckResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_PARSER_HEALTH_TIMEOUT_MS);

  try {
    const response = await fetch(`${getParserBaseUrl()}/health`, {
      method: 'GET',
      signal: controller.signal,
    });

    if (!response.ok) {
      return {
        healthy: false,
        errorMessage: `Parser health check failed with status ${response.status}`,
      };
    }

    const payload = (await response.json().catch(() => null)) as { status?: unknown } | null;
    if (payload?.status !== 'ok') {
      return {
        healthy: false,
        errorMessage: 'Parser health check returned an unexpected response',
      };
    }

    return { healthy: true, errorMessage: null };
  } catch (error) {
    return {
      healthy: false,
      errorMessage: error instanceof Error ? error.message : 'Parser health check failed',
    };
  } finally {
    clearTimeout(timer);
  }
}
