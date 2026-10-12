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
 * withdrawals subtract, the stored sign is ignored, and any other type does nothing. The amount
 * keeps its precision: a partner's share of a joint transaction can carry half a cent, which is
 * rounded once where the balance it feeds is added to a total.
 */
export function signedSavingsAmount(type: string, amount: number): number {
  const absolute = Math.abs(amount);
  if (type === 'withdrawal') return absolute === 0 ? 0 : -absolute;
  if (type === 'deposit' || type === 'interest') return absolute;
  return 0;
}
