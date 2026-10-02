import type { BudgetCategory } from '../types';

export function normalizeBudgetCategory(raw: BudgetCategory): BudgetCategory {
  return { ...raw, expenseClass: raw.expenseClass ?? 'essential' };
}
