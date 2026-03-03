import { useState } from 'react';
import { useCurrency } from '@/lib/CurrencyContext';
import type { BudgetPageData } from '../types';
import {
  buildCreateBudgetCategoryInput,
  createEmptyCategoryForm,
  deriveBudgetStats,
  mapRecentTransactions,
} from '../utils/budget-data';
import { useBudgetCategories } from './useBudgetCategories';
import { useBudgetTransactions } from './useBudgetTransactions';
import { useCreateBudgetCategory } from './useCreateBudgetCategory';

export function useBudgetPage(): BudgetPageData {
  const { fmtBase, baseCurrency } = useCurrency();
  const fmtDec = (n: number) => fmtBase(n, undefined, true);
  const fmt = (n: number) => fmtBase(n);
  const { data: categories = [], isLoading: loadingCategories } = useBudgetCategories();
  const { data: budgetTransactions = [], isLoading: loadingTransactions } = useBudgetTransactions();
  const createCategory = useCreateBudgetCategory();
  const [showAdd, setShowAdd] = useState(false);
  const [newCat, setNewCat] = useState(createEmptyCategoryForm());

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
    isLoading: loadingCategories || loadingTransactions,
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
