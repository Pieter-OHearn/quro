import type { BudgetCategory, BudgetTx } from '../types';

function toNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

export function normalizeBudgetCategory(raw: BudgetCategory): BudgetCategory {
  return {
    ...raw,
    budgeted: toNumber(raw.budgeted),
    spent: toNumber(raw.spent),
  };
}

export function normalizeBudgetTransaction(raw: BudgetTx): BudgetTx {
  return {
    ...raw,
    amount: toNumber(raw.amount),
  };
}
