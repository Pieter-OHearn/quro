import { DATA_COLORS } from '@/lib/dataColors';
import { useMemo, useState } from 'react';
import {
  MONTH_ABBREVIATIONS,
  formatBudgetMonthFromDate,
  toBudgetMonthIndex,
  type BudgetMonth,
  type CurrencyCode,
} from '@quro/shared';
import { useCurrency } from '@/lib/CurrencyContext';
import { getFailedRouteQueries } from '@/lib/routeQueryErrors';
import {
  buildCreateBudgetCategoryInput,
  budgetValuesForDisplay,
  deriveBudgetStats,
  mapMonthlyTransactions,
} from '../utils/budget-data';
import type { BudgetCategory, EditCategoryForm } from '../types';
import { useBudgetCategories } from './useBudgetCategories';
import { useBudgetTransactions } from './useBudgetTransactions';
import {
  useCreateBudgetCategory,
  useUpdateBudgetCategory,
  useDeleteBudgetTransaction,
  useUpdateBudgetTransaction,
} from './mutations';

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
    month: MONTH_ABBREVIATIONS[nextMonthIndex] ?? MONTH_ABBREVIATIONS[0],
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

function createAddCategoryDraft(
  month: BudgetMonth,
  year: number,
  currency: CurrencyCode,
): BudgetCategory {
  return {
    id: 0,
    currency,
    currencyNeedsReview: false,
    name: '',
    emoji: '\ud83d\udce6',
    budgeted: 0,
    spent: 0,
    color: DATA_COLORS['neutral'],
    month,
    year,
    expenseClass: 'essential',
  };
}

function useBudgetCategoryDialog(monthSelection: ReturnType<typeof useBudgetMonthSelection>) {
  const { baseCurrency } = useCurrency();
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [editingCategory, setEditingCategory] = useState<BudgetCategory | null>(null);
  const createCategory = useCreateBudgetCategory();
  const updateCategory = useUpdateBudgetCategory();
  const addCategoryDraft = useMemo(
    () =>
      createAddCategoryDraft(
        monthSelection.selectedMonth,
        monthSelection.selectedYear,
        baseCurrency,
      ),
    [monthSelection.selectedMonth, monthSelection.selectedYear, baseCurrency],
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
        addCategoryDraft.currency,
      ),
    );
    setIsAddingCategory(false);
  };

  const handleSaveEdit = async (form: EditCategoryForm) => {
    if (!editingCategory) return;
    await updateCategory.mutateAsync({
      id: editingCategory.id,
      currency: editingCategory.currency,
      name: form.name.trim() || editingCategory.name,
      emoji: form.emoji || editingCategory.emoji,
      budgeted:
        (Number.parseFloat(form.budgeted) || 0) === editingCategory.budgeted
          ? undefined
          : Number.parseFloat(form.budgeted) || 0,
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
  const { fmtBase, convertToBase, baseCurrency } = useCurrency();
  const fmt = (n: number) => fmtBase(n);
  const fmtDec = (n: number) => fmtBase(n, undefined, true);

  const monthSelection = useBudgetMonthSelection();
  const categoryDialog = useBudgetCategoryDialog(monthSelection);

  const monthQuery = { month: monthSelection.selectedMonth, year: monthSelection.selectedYear };
  const categoriesQuery = useBudgetCategories(monthQuery);
  const transactionsQuery = useBudgetTransactions(monthQuery);
  const deleteTransaction = useDeleteBudgetTransaction();
  const updateTransaction = useUpdateBudgetTransaction();

  const { categories, budgetTransactions } = budgetValuesForDisplay(
    categoriesQuery.data ?? [],
    transactionsQuery.data ?? [],
    baseCurrency,
    convertToBase,
  );
  const { totalBudgeted, totalSpent, remaining, savingsRate, overBudget, pieData } =
    deriveBudgetStats(categories);
  const monthlyTransactions = mapMonthlyTransactions(budgetTransactions, categories);

  return {
    isLoading: categoriesQuery.isLoading || transactionsQuery.isLoading,
    queryFailures: getFailedRouteQueries([
      { label: 'budget categories', ...categoriesQuery },
      { label: 'budget transactions', ...transactionsQuery },
    ]),
    currencyNeedsReview: [...categories, ...budgetTransactions].some(
      (row) => row.currencyNeedsReview,
    ),
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
