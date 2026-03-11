import type { SavingsAccount, SavingsTransaction } from '@quro/shared';

function toNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return 0;

    const compact = trimmed.replace(/\s+/g, '');
    const hasComma = compact.includes(',');
    const hasDot = compact.includes('.');
    let normalized = compact;

    if (hasComma && hasDot) {
      normalized =
        compact.lastIndexOf(',') > compact.lastIndexOf('.')
          ? compact.replaceAll('.', '').replace(',', '.')
          : compact.replaceAll(',', '');
    } else if (hasComma) {
      normalized = compact.replace(',', '.');
    }

    const parsed = Number.parseFloat(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

export function normalizeSavingsAccount(raw: SavingsAccount): SavingsAccount {
  return {
    ...raw,
    balance: toNumber(raw.balance),
    interestRate: toNumber(raw.interestRate),
  };
}

export function normalizeSavingsTransaction(raw: SavingsTransaction): SavingsTransaction {
  return {
    ...raw,
    amount: toNumber(raw.amount),
    note: raw.note ?? '',
  };
}
