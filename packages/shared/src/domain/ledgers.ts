import { fromCents, toCents } from '../utils/money.js';

/**
 * Net effect of a pension transaction on its pot's balance, in cents-exact money: a contribution
 * adds its amount net of tax, a fee subtracts, an annual statement adds its signed adjustment, and
 * any other type does nothing.
 */
export function pensionTransactionDelta(txn: {
  type: string;
  amount: number;
  taxAmount?: number | null;
}): number {
  if (txn.type === 'contribution')
    return fromCents(toCents(txn.amount) - toCents(txn.taxAmount ?? 0));
  if (txn.type === 'fee') return fromCents(-toCents(txn.amount)) || 0;
  if (txn.type === 'annual_statement') return fromCents(toCents(txn.amount)) || 0;
  return 0;
}

/**
 * Effect of a savings transaction on its account's balance: deposits and interest add,
 * withdrawals subtract, the stored sign is ignored, and any other type does nothing.
 */
export function signedSavingsAmount(type: string, amount: number): number {
  const absolute = Math.abs(toCents(amount));
  if (type === 'withdrawal') return fromCents(-absolute) || 0;
  if (type === 'deposit' || type === 'interest') return fromCents(absolute);
  return 0;
}
