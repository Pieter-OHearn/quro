const DEFAULT_PARSER_TIMEOUT_MS = 300_000;
const DEFAULT_PARSER_HEALTH_TIMEOUT_MS = 4_000;

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
  const value = process.env.PENSION_PARSER_URL?.trim();
  return value || 'http://pension-parser:8080';
}

export type ParserHealthCheckResult = {
  healthy: boolean;
  errorMessage: string | null;
};

function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function toFiniteNumber(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const parsed = Number.parseFloat(String(value ?? ''));
  return Number.isFinite(parsed) ? parsed : 0;
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
        amount: toFiniteNumber(row.amount),
        taxAmount: toFiniteNumber(row.taxAmount),
        date,
        note: typeof row.note === 'string' ? row.note : '',
        isEmployer: typeof row.isEmployer === 'boolean' ? row.isEmployer : null,
        confidence: Math.min(1, Math.max(0, toFiniteNumber(row.confidence))),
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
  const timeout = Number.parseInt(process.env.PENSION_PARSER_TIMEOUT_MS ?? '', 10);
  const timeoutMs = Number.isFinite(timeout) && timeout > 0 ? timeout : DEFAULT_PARSER_TIMEOUT_MS;
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

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Parser service failed: ${response.status} ${text}`);
    }

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
