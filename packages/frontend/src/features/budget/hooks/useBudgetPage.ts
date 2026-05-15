import { useMemo, useState } from 'react';
import {
  BUDGET_MONTHS,
  formatBudgetMonthFromDate,
  toBudgetMonthIndex,
  type BudgetMonth,
} from '@quro/shared';
import { useCurrency } from '@/lib/CurrencyContext';
import { getFailedRouteQueries } from '@/lib/routeQueryErrors';
import {
  buildCreateBudgetCategoryInput,
  deriveBudgetStats,
  mapMonthlyTransactions,
} from '../utils/budget-data';
import type { BudgetCategory, EditCategoryForm } from '../types';
import { useBudgetCategories } from './useBudgetCategories';
import { useBudgetTransactions } from './useBudgetTransactions';
import { useCreateBudgetCategory } from './useCreateBudgetCategory';
import { useUpdateBudgetCategory } from './useUpdateBudgetCategory';
import { useDeleteBudgetTransaction } from './useDeleteBudgetTransaction';
import { useUpdateBudgetTransaction } from './useUpdateBudgetTransaction';

const PREVIOUS_MONTH_DELTA = -1;
const NEXT_MONTH_DELTA = 1;

function currentMonthYear() {
  const now = new Date();
  return { month: formatBudgetMonthFromDate(now), year: now.getFullYear() };
}

function shiftMonth(month: BudgetMonth, year: number, delta: number) {
  const total = year * 12 + toBudgetMonthIndex(month) + delta;
  const nextMonthIndex = ((total % 12) + 12) % 12;
  return {
    month: BUDGET_MONTHS[nextMonthIndex] ?? BUDGET_MONTHS[0],
    year: Math.floor(total / 12),
  };
}

function useBudgetMonthSelection() {
  const current = currentMonthYear();
  const [selectedMonth, setSelectedMonth] = useState<BudgetMonth>(current.month);
  const [selectedYear, setSelectedYear] = useState(current.year);
  const isCurrentMonth = selectedMonth === current.month && selectedYear === current.year;

  return {
    selectedMonth,
    selectedYear,
    isCurrentMonth,
    navigatePrev: () => {
      const n = shiftMonth(selectedMonth, selectedYear, PREVIOUS_MONTH_DELTA);
      setSelectedMonth(n.month);
      setSelectedYear(n.year);
    },
    navigateNext: () => {
      if (isCurrentMonth) return;
      const n = shiftMonth(selectedMonth, selectedYear, NEXT_MONTH_DELTA);
      setSelectedMonth(n.month);
      setSelectedYear(n.year);
    },
  };
}

function createAddCategoryDraft(month: BudgetMonth, year: number): BudgetCategory {
  return {
    id: 0,
    name: '',
    emoji: '\ud83d\udce6',
    budgeted: 0,
    spent: 0,
    color: '#94a3b8',
    month,
    year,
  };
}

function useBudgetCategoryDialog(monthSelection: ReturnType<typeof useBudgetMonthSelection>) {
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [editingCategory, setEditingCategory] = useState<BudgetCategory | null>(null);
  const createCategory = useCreateBudgetCategory();
  const updateCategory = useUpdateBudgetCategory();
  const addCategoryDraft = useMemo(
    () => createAddCategoryDraft(monthSelection.selectedMonth, monthSelection.selectedYear),
    [monthSelection.selectedMonth, monthSelection.selectedYear],
  );

  const openAddCategory = () => {
    setEditingCategory(null);
    setIsAddingCategory(true);
  };

  const closeCategoryDialog = () => {
    setEditingCategory(null);
    setIsAddingCategory(false);
  };

  const handleAddCategory = async (form: EditCategoryForm) => {
    if (!form.name.trim()) return;
    await createCategory.mutateAsync(
      buildCreateBudgetCategoryInput(
        form,
        new Date(monthSelection.selectedYear, toBudgetMonthIndex(monthSelection.selectedMonth)),
      ),
    );
    setIsAddingCategory(false);
  };

  const handleSaveEdit = async (form: EditCategoryForm) => {
    if (!editingCategory) return;
    await updateCategory.mutateAsync({
      id: editingCategory.id,
      name: form.name.trim() || editingCategory.name,
      emoji: form.emoji || editingCategory.emoji,
      budgeted: Number.parseFloat(form.budgeted) || 0,
      color: form.color || editingCategory.color,
    });
    setEditingCategory(null);
  };

  return {
    isAddingCategory,
    addCategoryDraft,
    openAddCategory,
    closeCategoryDialog,
    handleAddCategory,
    editingCategory,
    setEditingCategory,
    handleSaveEdit,
    isSavingCategory: createCategory.isPending || updateCategory.isPending,
  };
}

export function useBudgetPage() {
  const { fmtBase } = useCurrency();
  const fmt = (n: number) => fmtBase(n);
  const fmtDec = (n: number) => fmtBase(n, undefined, true);

  const monthSelection = useBudgetMonthSelection();
  const categoryDialog = useBudgetCategoryDialog(monthSelection);

  const monthQuery = { month: monthSelection.selectedMonth, year: monthSelection.selectedYear };
  const categoriesQuery = useBudgetCategories(monthQuery);
  const transactionsQuery = useBudgetTransactions(monthQuery);
  const deleteTransaction = useDeleteBudgetTransaction();
  const updateTransaction = useUpdateBudgetTransaction();

  const categories = categoriesQuery.data ?? [];
  const budgetTransactions = transactionsQuery.data ?? [];
  const { totalBudgeted, totalSpent, remaining, savingsRate, overBudget, pieData } =
    deriveBudgetStats(categories);
  const monthlyTransactions = mapMonthlyTransactions(budgetTransactions, categories);

  return {
    isLoading: categoriesQuery.isLoading || transactionsQuery.isLoading,
    queryFailures: getFailedRouteQueries([
      { label: 'budget categories', ...categoriesQuery },
      { label: 'budget transactions', ...transactionsQuery },
    ]),
    fmt,
    fmtDec,
    categories,
    budgetTransactions,
    totalBudgeted,
    totalSpent,
    remaining,
    savingsRate,
    overBudget,
    pieData,
    monthlyTransactions,
    ...monthSelection,
    ...categoryDialog,
    handleDeleteTransaction: (id: number) => deleteTransaction.mutate(id),
    handleChangeTxCategory: (id: number, categoryId: number) =>
      updateTransaction.mutate({ id, categoryId }),
  };
}
