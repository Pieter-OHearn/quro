import type {
  BudgetCategory,
  BudgetStats,
  BudgetTx,
  CreateBudgetCategoryInput,
  NewCategoryForm,
  RecentBudgetTx,
} from '../types';

export const createEmptyCategoryForm = (): NewCategoryForm => ({ name: '', budgeted: '' });

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

export function mapRecentTransactions(
  budgetTransactions: readonly BudgetTx[],
  categories: readonly BudgetCategory[],
): RecentBudgetTx[] {
  return budgetTransactions.slice(0, 10).map((transaction) => {
    const category = categories.find((item) => item.id === transaction.categoryId);

    return {
      id: transaction.id,
      name: transaction.merchant || transaction.description,
      category: category?.name ?? '',
      amount: transaction.amount,
      date: transaction.date,
      emoji: category?.emoji ?? '\ud83d\udce6',
      color: category?.color,
    };
  });
}

export function buildCreateBudgetCategoryInput(
  newCategory: NewCategoryForm,
  now = new Date(),
): CreateBudgetCategoryInput {
  return {
    name: newCategory.name,
    emoji: '\ud83d\udce6',
    budgeted: Number.parseFloat(newCategory.budgeted),
    spent: 0,
    color: '#94a3b8',
    month: now.toLocaleString('en-US', { month: 'short' }),
    year: now.getFullYear(),
  };
}
