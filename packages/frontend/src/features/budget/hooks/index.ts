import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { BudgetCategory, BudgetTransaction } from '@quro/shared';

// ── Categories ────────────────────────────────────────────────────────

export function useBudgetCategories() {
  return useQuery({
    queryKey: ['budget', 'categories'],
    queryFn: async () => {
      const { data } = await api.get('/api/budget/categories');
      return data.data as BudgetCategory[];
    },
  });
}

export function useCreateBudgetCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (category: Omit<BudgetCategory, 'id'>) => {
      const { data } = await api.post('/api/budget/categories', category);
      return data.data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['budget'] });
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useUpdateBudgetCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...category }: BudgetCategory) => {
      const { data } = await api.patch(`/api/budget/categories/${id}`, category);
      return data.data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['budget'] });
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useDeleteBudgetCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/api/budget/categories/${id}`);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['budget'] });
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

// ── Transactions ──────────────────────────────────────────────────────

export function useBudgetTransactions(categoryId?: number) {
  return useQuery({
    queryKey: ['budget', 'transactions', categoryId],
    queryFn: async () => {
      const params = categoryId ? { categoryId } : {};
      const { data } = await api.get('/api/budget/transactions', { params });
      return data.data as BudgetTransaction[];
    },
  });
}

export function useCreateBudgetTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (txn: Omit<BudgetTransaction, 'id'>) => {
      const { data } = await api.post('/api/budget/transactions', txn);
      return data.data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['budget'] });
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useDeleteBudgetTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/api/budget/transactions/${id}`);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['budget'] });
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}
