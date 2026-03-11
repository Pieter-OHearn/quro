import type { Debt, DebtPayment } from '@quro/shared';

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

export function normalizeDebt(raw: Debt): Debt {
  return {
    ...raw,
    originalAmount: toNumber(raw.originalAmount),
    remainingBalance: toNumber(raw.remainingBalance),
    interestRate: toNumber(raw.interestRate),
    monthlyPayment: toNumber(raw.monthlyPayment),
    endDate: raw.endDate ?? null,
    notes: raw.notes ?? null,
  };
}

export function normalizeDebtPayment(raw: DebtPayment): DebtPayment {
  return {
    ...raw,
    amount: toNumber(raw.amount),
    principal: toNumber(raw.principal),
    interest: toNumber(raw.interest),
    note: raw.note ?? '',
  };
}
