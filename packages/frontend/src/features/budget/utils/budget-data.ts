import type {
  BudgetCategory,
  BudgetStats,
  BudgetTx,
  CreateBudgetCategoryInput,
  EditCategoryForm,
  RecentBudgetTx,
} from '../types';
import { formatBudgetMonthFromDate } from '@quro/shared';

export function deriveBudgetStats(categories: readonly BudgetCategory[]): BudgetStats {
  const totalBudgeted = categories.reduce((sum, category) => sum + category.budgeted, 0);
  const totalSpent = categories.reduce((sum, category) => sum + category.spent, 0);
  const remaining = totalBudgeted - totalSpent;
  const monthIncome = totalBudgeted > 0 ? totalBudgeted : 1;
  const savingsRate = ((monthIncome - totalSpent) / monthIncome) * 100;
  const overBudget = categories.filter((category) => category.spent > category.budgeted);
  const pieData = categories
    .filter((category) => category.spent > 0)
    .map((category) => ({ name: category.name, value: category.spent, color: category.color }));

  return { totalBudgeted, totalSpent, remaining, savingsRate, overBudget, pieData };
}

export function mapMonthlyTransactions(
  budgetTransactions: readonly BudgetTx[],
  categories: readonly BudgetCategory[],
): RecentBudgetTx[] {
  return budgetTransactions.map((transaction) => {
    const category = categories.find((item) => item.id === transaction.categoryId);

    return {
      id: transaction.id,
      name: transaction.merchant || transaction.description,
      category: category?.name ?? '',
      categoryId: transaction.categoryId,
      amount: transaction.amount,
      date: transaction.date,
      emoji: category?.emoji ?? '\ud83d\udce6',
      color: category?.color,
      bunqTransactionId: transaction.bunqTransactionId,
      sourceProvider: transaction.sourceProvider,
      sourceAccountId: transaction.sourceAccountId,
      sourceAccountName: transaction.sourceAccountName,
      sourceAccountType: transaction.sourceAccountType,
    };
  });
}

export function buildCreateBudgetCategoryInput(
  newCategory: EditCategoryForm,
  now = new Date(),
): CreateBudgetCategoryInput {
  return {
    name: newCategory.name.trim(),
    emoji: newCategory.emoji || '\ud83d\udce6',
    budgeted: Number.parseFloat(newCategory.budgeted) || 0,
    spent: 0,
    color: newCategory.color || '#94a3b8',
    month: formatBudgetMonthFromDate(now),
    year: now.getFullYear(),
  };
}
