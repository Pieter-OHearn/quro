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

export const normalizePensionPot = (pot: ApiPensionPot): PensionPot => ({
  ...pot,
  id: toPositiveInt((pot as { id?: IntegerLike }).id),
  balance: toNumber(pot.balance),
  employeeMonthly: toNumber(pot.employeeMonthly),
  employerMonthly: toNumber(pot.employerMonthly),
});

export const normalizePensionTransaction = (txn: ApiPensionTransaction): PensionTransaction => ({
  ...txn,
  id: toPositiveInt((txn as { id?: IntegerLike }).id),
  potId: toPositiveInt((txn as { potId?: IntegerLike }).potId),
  amount: toNumber(txn.amount),
});
