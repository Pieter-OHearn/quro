import type { PensionTransactionType } from '@quro/shared';

export type PensionTransactionDeltaInput = {
  type: PensionTransactionType | string;
  amount: number;
  taxAmount: number;
};

// Net effect of a pension transaction on its pot's balance.
export function computePensionTransactionDelta(txn: PensionTransactionDeltaInput): number {
  if (txn.type === 'contribution') return txn.amount - txn.taxAmount;
  if (txn.type === 'fee') return -txn.amount;
  if (txn.type === 'annual_statement') return txn.amount;
  return 0;
}
