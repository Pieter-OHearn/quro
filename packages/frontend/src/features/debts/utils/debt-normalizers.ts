import type { Debt, DebtPayment } from '@quro/shared';

export function normalizeDebt(raw: Debt): Debt {
  return {
    ...raw,
    endDate: raw.endDate ?? null,
    notes: raw.notes ?? null,
  };
}

export function normalizeDebtPayment(raw: DebtPayment): DebtPayment {
  return {
    ...raw,
    note: raw.note ?? '',
  };
}
