import { useState } from 'react';
import { useCurrency } from '@/lib/CurrencyContext';
import { getFailedRouteQueries } from '@/lib/routeQueryErrors';
import {
  buildCreateBudgetCategoryInput,
  createEmptyCategoryForm,
  deriveBudgetStats,
  mapRecentTransactions,
} from '../utils/budget-data';
import { useBudgetCategories } from './useBudgetCategories';
import { useBudgetTransactions } from './useBudgetTransactions';
import { useCreateBudgetCategory } from './useCreateBudgetCategory';

export function useBudgetPage() {
  const { fmtBase, baseCurrency } = useCurrency();
  const fmtDec = (n: number) => fmtBase(n, undefined, true);
  const fmt = (n: number) => fmtBase(n);
  const categoriesQuery = useBudgetCategories();
  const transactionsQuery = useBudgetTransactions();
  const createCategory = useCreateBudgetCategory();
  const [showAdd, setShowAdd] = useState(false);
  const [newCat, setNewCat] = useState(createEmptyCategoryForm());
  const categories = categoriesQuery.data ?? [];
  const budgetTransactions = transactionsQuery.data ?? [];

  const { totalBudgeted, totalSpent, remaining, savingsRate, overBudget, pieData } =
    deriveBudgetStats(categories);
  const recentTransactions = mapRecentTransactions(budgetTransactions, categories);

  const handleAddCategory = () => {
    if (!newCat.name || !newCat.budgeted) return;

    createCategory.mutate(buildCreateBudgetCategoryInput(newCat));
    setNewCat(createEmptyCategoryForm());
    setShowAdd(false);
  };

  return {
    isLoading: categoriesQuery.isLoading || transactionsQuery.isLoading,
    queryFailures: getFailedRouteQueries([
      { label: 'budget categories', ...categoriesQuery },
      { label: 'budget transactions', ...transactionsQuery },
    ]),
    fmt,
    fmtDec,
    baseCurrency,
    categories,
    budgetTransactions,
    totalBudgeted,
    totalSpent,
    remaining,
    savingsRate,
    overBudget,
    pieData,
    recentTransactions,
    showAdd,
    newCat,
    toggleAdd: () => setShowAdd((current) => !current),
    setNewCat,
    handleAddCategory,
  };
}
