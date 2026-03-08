import type {
  PensionStatementImportFeedItem,
  PensionStatementImport,
  PensionStatementImportSummary,
  PensionStatementImportRow,
  PensionPot,
  PensionStatementDocument,
  PensionTransaction,
} from '@quro/shared';
import type {
  ApiPensionStatementImportFeedItem,
  ApiPensionStatementImport,
  ApiPensionStatementImportSummary,
  ApiPensionStatementImportRow,
  ApiPensionPot,
  ApiPensionStatementDocument,
  ApiPensionTransaction,
  IntegerLike,
  NumericLike,
} from '../types';

const DEFAULT_STATEMENT_FILE_NAME = 'statement.pdf';
const DEFAULT_POT_NAME = 'Pension Pot';
const DEFAULT_POT_PROVIDER = 'Unknown provider';
const DEFAULT_POT_EMOJI = '🏦';

const PENSION_TYPE_ALIASES: Record<string, PensionPot['type']> = {
  'workplace pension': 'Workplace Pension',
  workplace: 'Workplace Pension',
  superannuation: 'Workplace Pension',
  'employer pensioenfonds': 'Workplace Pension',
  'personal pension': 'Personal Pension',
  sipp: 'Personal Pension',
  'self-managed super fund': 'Personal Pension',
  'lijfrente / private pension': 'Personal Pension',
  'state pension': 'State Pension',
  'government age pension': 'State Pension',
  aow: 'State Pension',
  other: 'Other',
};

const ROW_TYPES = new Set<PensionStatementImportRow['type']>([
  'contribution',
  'fee',
  'annual_statement',
]);

const toNumber = (value: NumericLike): number => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

const toPositiveInt = (value: IntegerLike): number => {
  if (typeof value === 'number') {
    return Number.isInteger(value) && value > 0 ? value : 0;
  }
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
  }
  return 0;
};

function toStringOr(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function toOptionalString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function toNonEmptyStringOr(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  return value.trim() ? value : fallback;
}

function toIsoStringOrNow(value: unknown): string {
  return typeof value === 'string' ? value : new Date().toISOString();
}

function toDateOnlyOrToday(value: unknown): string {
  return typeof value === 'string' ? value : new Date().toISOString().slice(0, 10);
}

function normalizePensionPotType(rawType: unknown): PensionPot['type'] {
  if (typeof rawType !== 'string') return 'Other';
  return PENSION_TYPE_ALIASES[rawType.trim().toLowerCase()] ?? 'Other';
}

function normalizePensionMetadata(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};

  return Object.entries(value).reduce<Record<string, string>>((acc, [rawKey, rawValue]) => {
    const key = rawKey.trim();
    if (!key || rawValue == null) return acc;

    if (
      typeof rawValue === 'string' ||
      typeof rawValue === 'number' ||
      typeof rawValue === 'boolean'
    ) {
      acc[key] = String(rawValue);
    }

    return acc;
  }, {});
}

function toStatus(value: unknown): PensionStatementImport['status'] {
  if (
    value === 'queued' ||
    value === 'processing' ||
    value === 'ready_for_review' ||
    value === 'failed' ||
    value === 'committed' ||
    value === 'expired' ||
    value === 'cancelled'
  ) {
    return value;
  }
  return 'failed';
}

function toConfidenceLabel(value: unknown): PensionStatementImportRow['confidenceLabel'] {
  if (value === 'high' || value === 'medium') return value;
  return 'low';
}

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

function normalizeEvidence(evidence: unknown): Array<{ page: number | null; snippet: string }> {
  if (!Array.isArray(evidence)) return [];
  return evidence
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      const row = entry as { page?: unknown; snippet?: unknown };
      const snippet = toStringOr(row.snippet).trim();
      if (!snippet) return null;
      const page = Number.isInteger(row.page) ? Number(row.page) : null;
      return { page, snippet };
    })
    .filter((entry): entry is { page: number | null; snippet: string } => entry !== null);
}

function toOptionalCount(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  return toNumber(value as NumericLike);
}

function toCount(value: unknown): number {
  if (value === undefined) return 0;
  return toNumber(value as NumericLike);
}

function normalizeImportRowType(value: unknown): PensionStatementImportRow['type'] {
  if (typeof value !== 'string') return 'annual_statement';
  return ROW_TYPES.has(value as PensionStatementImportRow['type'])
    ? (value as PensionStatementImportRow['type'])
    : 'annual_statement';
}

function normalizeCollisionWarning(value: unknown): PensionStatementImportRow['collisionWarning'] {
  if (!value || typeof value !== 'object') return null;
  const collision = value as { existingTransactionId?: IntegerLike; reason?: unknown };
  return {
    existingTransactionId: toPositiveInt(collision.existingTransactionId),
    reason: toStringOr(collision.reason),
  };
}

export const normalizePensionPot = (pot: ApiPensionPot): PensionPot => ({
  ...pot,
  id: toPositiveInt((pot as { id?: IntegerLike }).id),
  type: normalizePensionPotType(pot.type),
  balance: toNumber(pot.balance),
  employeeMonthly: toNumber(pot.employeeMonthly),
  employerMonthly: toNumber(pot.employerMonthly),
  investmentStrategy: toOptionalString(pot.investmentStrategy)?.trim() || null,
  metadata: normalizePensionMetadata(pot.metadata),
  notes: toStringOr(pot.notes),
});

export const normalizePensionTransaction = (txn: ApiPensionTransaction): PensionTransaction => ({
  ...txn,
  id: toPositiveInt((txn as { id?: IntegerLike }).id),
  potId: toPositiveInt((txn as { potId?: IntegerLike }).potId),
  amount: toNumber(txn.amount),
  taxAmount: toNumber(txn.taxAmount),
  note: toStringOr(txn.note),
});

export const normalizePensionStatementDocument = (
  document: ApiPensionStatementDocument,
): PensionStatementDocument => ({
  ...document,
  id: toPositiveInt((document as { id?: IntegerLike }).id),
  transactionId: toPositiveInt((document as { transactionId?: IntegerLike }).transactionId),
  potId: toPositiveInt((document as { potId?: IntegerLike }).potId),
  sizeBytes: toNumber(document.sizeBytes),
  mimeType: 'application/pdf',
  fileName: toStringOr(document.fileName, DEFAULT_STATEMENT_FILE_NAME),
  uploadedAt: toIsoStringOrNow(document.uploadedAt),
});

export const normalizePensionStatementImport = (
  value: ApiPensionStatementImport,
): PensionStatementImport => ({
  ...value,
  id: toPositiveInt((value as { id?: IntegerLike }).id),
  potId: toPositiveInt((value as { potId?: IntegerLike }).potId),
  sizeBytes: toNumber(value.sizeBytes),
  status: toStatus(value.status),
  mimeType: 'application/pdf',
  fileName: toStringOr(value.fileName, DEFAULT_STATEMENT_FILE_NAME),
  fileHashSha256: toStringOr(value.fileHashSha256),
  statementPeriodStart: toOptionalString(value.statementPeriodStart),
  statementPeriodEnd: toOptionalString(value.statementPeriodEnd),
  languageHints: normalizeStringList(value.languageHints),
  modelName: toOptionalString(value.modelName),
  modelVersion: toOptionalString(value.modelVersion),
  errorMessage: toOptionalString(value.errorMessage),
  createdAt: toIsoStringOrNow(value.createdAt),
  updatedAt: toIsoStringOrNow(value.updatedAt),
  expiresAt: toIsoStringOrNow(value.expiresAt),
  committedAt: toOptionalString(value.committedAt),
  totalRows: toOptionalCount(value.totalRows),
  deletedRows: toOptionalCount(value.deletedRows),
  activeRows: toOptionalCount(value.activeRows),
});

export const normalizePensionStatementImportSummary = (
  value: ApiPensionStatementImportSummary,
): PensionStatementImportSummary => ({
  id: toPositiveInt((value as { id?: IntegerLike }).id),
  potId: toPositiveInt((value as { potId?: IntegerLike }).potId),
  status: toStatus(value.status),
  fileName: toStringOr(value.fileName, DEFAULT_STATEMENT_FILE_NAME),
  errorMessage: toOptionalString(value.errorMessage),
  createdAt: toIsoStringOrNow(value.createdAt),
  updatedAt: toIsoStringOrNow(value.updatedAt),
  totalRows: toCount(value.totalRows),
  deletedRows: toCount(value.deletedRows),
  activeRows: toCount(value.activeRows),
  potName: toStringOr(value.potName, DEFAULT_POT_NAME),
  potProvider: toStringOr(value.potProvider, DEFAULT_POT_PROVIDER),
  potEmoji: toNonEmptyStringOr(value.potEmoji, DEFAULT_POT_EMOJI),
});

export const normalizePensionStatementImportFeedItem = (
  value: ApiPensionStatementImportFeedItem,
): PensionStatementImportFeedItem => {
  const pot = value.pot;
  const emoji = typeof pot?.emoji === 'string' && pot.emoji.trim().length > 0 ? pot.emoji : null;

  return {
    import: normalizePensionStatementImport(value.import),
    pot: {
      id: toPositiveInt(pot?.id),
      name: toStringOr(pot?.name, DEFAULT_POT_NAME),
      provider: toStringOr(pot?.provider, DEFAULT_POT_PROVIDER),
      emoji,
    },
  };
};

export const normalizePensionStatementImportRow = (
  value: ApiPensionStatementImportRow,
): PensionStatementImportRow => {
  const committedTransactionId = toPositiveInt(
    (value as { committedTransactionId?: IntegerLike }).committedTransactionId,
  );

  return {
    ...value,
    id: toPositiveInt((value as { id?: IntegerLike }).id),
    importId: toPositiveInt((value as { importId?: IntegerLike }).importId),
    rowOrder: toPositiveInt((value as { rowOrder?: IntegerLike }).rowOrder),
    type: normalizeImportRowType(value.type),
    amount: toNumber(value.amount),
    taxAmount: toNumber(value.taxAmount),
    confidence: toNumber(value.confidence),
    confidenceLabel: toConfidenceLabel(value.confidenceLabel),
    evidence: normalizeEvidence(value.evidence),
    isDeleted: Boolean(value.isDeleted),
    isDerived: Boolean(value.isDerived),
    note: toStringOr(value.note),
    date: toDateOnlyOrToday(value.date),
    isEmployer: typeof value.isEmployer === 'boolean' ? value.isEmployer : null,
    collisionWarning: normalizeCollisionWarning(value.collisionWarning),
    committedTransactionId: committedTransactionId > 0 ? committedTransactionId : null,
    editedAt: toOptionalString(value.editedAt),
    createdAt: toIsoStringOrNow(value.createdAt),
    updatedAt: toIsoStringOrNow(value.updatedAt),
  };
};
