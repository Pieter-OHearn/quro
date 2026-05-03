import { useState } from 'react';
import { useCurrency } from '@/lib/CurrencyContext';
import { getFailedRouteQueries } from '@/lib/routeQueryErrors';
import {
  buildCreateBudgetCategoryInput,
  createEmptyCategoryForm,
  deriveBudgetStats,
  mapRecentTransactions,
} from '../utils/budget-data';
import type { BudgetCategory, EditCategoryForm } from '../types';
import { useBudgetCategories } from './useBudgetCategories';
import { useBudgetTransactions } from './useBudgetTransactions';
import { useCreateBudgetCategory } from './useCreateBudgetCategory';
import { useUpdateBudgetCategory } from './useUpdateBudgetCategory';
import { useDeleteBudgetTransaction } from './useDeleteBudgetTransaction';
import { useUpdateBudgetTransaction } from './useUpdateBudgetTransaction';

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

type Month = (typeof MONTHS)[number];

function currentMonthYear() {
  const now = new Date();
  return { month: MONTHS[now.getMonth()] as Month, year: now.getFullYear() };
}

function shiftMonth(month: Month, year: number, delta: number) {
  const total = year * 12 + MONTHS.indexOf(month) + delta;
  return { month: MONTHS[((total % 12) + 12) % 12] as Month, year: Math.floor(total / 12) };
}

function useBudgetMonthSelection() {
  const current = currentMonthYear();
  const [selectedMonth, setSelectedMonth] = useState<Month>(current.month);
  const [selectedYear, setSelectedYear] = useState(current.year);
  const isCurrentMonth = selectedMonth === current.month && selectedYear === current.year;

  return {
    selectedMonth,
    selectedYear,
    isCurrentMonth,
    navigatePrev: () => {
      const n = shiftMonth(selectedMonth, selectedYear, -1);
      setSelectedMonth(n.month);
      setSelectedYear(n.year);
    },
    navigateNext: () => {
      if (isCurrentMonth) return;
      const n = shiftMonth(selectedMonth, selectedYear, 1);
      setSelectedMonth(n.month);
      setSelectedYear(n.year);
    },
  };
}

export function useBudgetPage() {
  const { fmtBase, baseCurrency } = useCurrency();
  const fmt = (n: number) => fmtBase(n);
  const fmtDec = (n: number) => fmtBase(n, undefined, true);

  const monthSelection = useBudgetMonthSelection();
  const [showAdd, setShowAdd] = useState(false);
  const [newCat, setNewCat] = useState(createEmptyCategoryForm());
  const [editingCategory, setEditingCategory] = useState<BudgetCategory | null>(null);

  const monthQuery = { month: monthSelection.selectedMonth, year: monthSelection.selectedYear };
  const categoriesQuery = useBudgetCategories(monthQuery);
  const transactionsQuery = useBudgetTransactions(monthQuery);
  const createCategory = useCreateBudgetCategory();
  const updateCategory = useUpdateBudgetCategory();
  const deleteTransaction = useDeleteBudgetTransaction();
  const updateTransaction = useUpdateBudgetTransaction();

  const categories = categoriesQuery.data ?? [];
  const budgetTransactions = transactionsQuery.data ?? [];
  const { totalBudgeted, totalSpent, remaining, savingsRate, overBudget, pieData } =
    deriveBudgetStats(categories);
  const recentTransactions = mapRecentTransactions(budgetTransactions, categories);

  const handleAddCategory = () => {
    if (!newCat.name || !newCat.budgeted) return;
    createCategory.mutate(
      buildCreateBudgetCategoryInput(
        newCat,
        new Date(monthSelection.selectedYear, MONTHS.indexOf(monthSelection.selectedMonth)),
      ),
    );
    setNewCat(createEmptyCategoryForm());
    setShowAdd(false);
  };

  const handleSaveEdit = (form: EditCategoryForm) => {
    if (!editingCategory) return;
    updateCategory.mutate({
      id: editingCategory.id,
      name: form.name.trim() || editingCategory.name,
      emoji: form.emoji || editingCategory.emoji,
      budgeted: Number.parseFloat(form.budgeted) || 0,
      color: form.color || editingCategory.color,
    });
    setEditingCategory(null);
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
    ...monthSelection,
    showAdd,
    newCat,
    toggleAdd: () => setShowAdd((v) => !v),
    setNewCat,
    handleAddCategory,
    editingCategory,
    setEditingCategory,
    handleSaveEdit,
    isUpdating: updateCategory.isPending,
    handleDeleteTransaction: (id: number) => deleteTransaction.mutate(id),
    handleChangeTxCategory: (id: number, categoryId: number) =>
      updateTransaction.mutate({ id, categoryId }),
  };
}
