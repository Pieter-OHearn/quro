import { normalizePdfDocument } from '@/lib/pdfDocuments';
import {
  type PensionStatementImportFeedItem,
  type PensionStatementImportRow,
  type PensionPot,
  type PensionStatementDocument,
  type PensionTransaction,
  DEFAULT_EMOJI,
} from '@quro/shared';
import type {
  ApiPensionStatementImportFeedItem,
  ApiPensionStatementImportRow,
  ApiPensionPot,
  ApiPensionStatementDocument,
  ApiPensionTransaction,
  IntegerLike,
} from '../types';

const DEFAULT_STATEMENT_FILE_NAME = 'statement.pdf';
const DEFAULT_POT_NAME = 'Pension Pot';
const DEFAULT_POT_PROVIDER = 'Unknown provider';

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

export const normalizePensionPot = (pot: ApiPensionPot): PensionPot => ({
  ...pot,
  id: toPositiveInt((pot as { id?: IntegerLike }).id),
  type: normalizePensionPotType(pot.type),
  investmentStrategy: toOptionalString(pot.investmentStrategy)?.trim() || null,
  metadata: normalizePensionMetadata(pot.metadata),
  color: toOptionalString(pot.color)?.trim() || '#475569',
  emoji: toOptionalString(pot.emoji)?.trim() || DEFAULT_EMOJI.pension,
  notes: toStringOr(pot.notes),
});

export const normalizePensionTransaction = (txn: ApiPensionTransaction): PensionTransaction => ({
  ...txn,
  id: toPositiveInt((txn as { id?: IntegerLike }).id),
  potId: toPositiveInt((txn as { potId?: IntegerLike }).potId),
  note: toStringOr(txn.note),
});

export const normalizePensionStatementDocument = (
  document: ApiPensionStatementDocument,
): PensionStatementDocument => {
  const normalizedDocument = normalizePdfDocument(document);

  return {
    ...document,
    id: toPositiveInt((document as { id?: IntegerLike }).id),
    transactionId: toPositiveInt((document as { transactionId?: IntegerLike }).transactionId),
    potId: toPositiveInt((document as { potId?: IntegerLike }).potId),
    sizeBytes: normalizedDocument?.sizeBytes ?? 0,
    mimeType: 'application/pdf',
    fileName: normalizedDocument?.fileName ?? DEFAULT_STATEMENT_FILE_NAME,
    uploadedAt: normalizedDocument?.uploadedAt ?? document.uploadedAt,
  };
};

export const normalizePensionStatementImportFeedItem = (
  value: ApiPensionStatementImportFeedItem,
): PensionStatementImportFeedItem => {
  const pot = value.pot;
  const emoji =
    typeof pot?.emoji === 'string' && pot.emoji.trim().length > 0
      ? pot.emoji
      : DEFAULT_EMOJI.pension;

  return {
    import: value.import,
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
): PensionStatementImportRow => ({
  ...value,
  evidence: normalizeEvidence(value.evidence),
  collisionWarning: value.collisionWarning ?? null,
});
