import type { PensionPot, PensionTransaction } from '@quro/shared';
import type { ApiPensionPot, ApiPensionTransaction, IntegerLike, NumericLike } from '../types';

const toNumber = (value: NumericLike): number => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    const parsed = parseFloat(value);
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

function normalizePensionPotType(rawType: unknown): PensionPot['type'] {
  if (typeof rawType !== 'string') return 'Other';
  return PENSION_TYPE_ALIASES[rawType.trim().toLowerCase()] ?? 'Other';
}

function normalizePensionMetadata(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};

  return Object.entries(value).reduce<Record<string, string>>((acc, [rawKey, rawValue]) => {
    const key = rawKey.trim();
    if (!key) return acc;
    if (rawValue == null) return acc;

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

export const normalizePensionPot = (pot: ApiPensionPot): PensionPot => ({
  ...pot,
  id: toPositiveInt((pot as { id?: IntegerLike }).id),
  type: normalizePensionPotType(pot.type),
  balance: toNumber(pot.balance),
  employeeMonthly: toNumber(pot.employeeMonthly),
  employerMonthly: toNumber(pot.employerMonthly),
  investmentStrategy:
    typeof pot.investmentStrategy === 'string' && pot.investmentStrategy.trim()
      ? pot.investmentStrategy.trim()
      : null,
  metadata: normalizePensionMetadata(pot.metadata),
  notes: typeof pot.notes === 'string' ? pot.notes : '',
});

export const normalizePensionTransaction = (txn: ApiPensionTransaction): PensionTransaction => ({
  ...txn,
  id: toPositiveInt((txn as { id?: IntegerLike }).id),
  potId: toPositiveInt((txn as { potId?: IntegerLike }).potId),
  amount: toNumber(txn.amount),
  taxAmount: toNumber(txn.taxAmount),
  note: typeof txn.note === 'string' ? txn.note : '',
});
