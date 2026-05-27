import { useMutation, useQueryClient } from '@tanstack/react-query';
import { BUDGET_MONTHS, formatBudgetMonthFromDate, type BudgetMonth } from '@quro/shared';
import { api } from '@/lib/api';
import type { CreateBudgetTransactionInput } from '../types';

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTH_INDEX_OFFSET = 1;

function getBudgetPeriodFromDate(date: string): { month: BudgetMonth; year: number } {
  const match = ISO_DATE_PATTERN.exec(date);
  if (match) {
    const [, rawYear, rawMonth] = match;
    const monthIndex = Number(rawMonth) - MONTH_INDEX_OFFSET;
    const month = BUDGET_MONTHS[monthIndex];
    if (month) {
      return { month, year: Number(rawYear) };
    }
  }

  const parsedDate = new Date(date);
  return { month: formatBudgetMonthFromDate(parsedDate), year: parsedDate.getFullYear() };
}

export function useCreateBudgetTransaction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (transaction: CreateBudgetTransactionInput) => {
      const { data } = await api.post('/api/budget/transactions', transaction);
      return data.data;
    },
    onSuccess: (_, variables) => {
      const { month, year } = getBudgetPeriodFromDate(variables.date);
      void queryClient.invalidateQueries({
        queryKey: ['budget', 'categories', month, year],
      });
      void queryClient.invalidateQueries({
        queryKey: ['budget', 'transactions', month, year],
      });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}
