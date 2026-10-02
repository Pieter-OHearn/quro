import type { SavingsTransaction } from '@quro/shared';

export function normalizeSavingsTransaction(raw: SavingsTransaction): SavingsTransaction {
  return {
    ...raw,
    note: raw.note ?? '',
  };
}
