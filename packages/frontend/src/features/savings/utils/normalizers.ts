import type { SavingsAccount, SavingsTransaction } from '@quro/shared';

export function normalizeSavingsAccount(raw: SavingsAccount): SavingsAccount {
  return raw;
}

export function normalizeSavingsTransaction(raw: SavingsTransaction): SavingsTransaction {
  return {
    ...raw,
    note: raw.note ?? '',
  };
}
