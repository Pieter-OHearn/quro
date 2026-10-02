import { useDomainMutation } from '@/lib/useDomainMutation';
import type { BudgetCategory } from '@quro/shared';
import { apiPost, api, apiPatch } from '@/lib/api';
import type { CreateBudgetCategoryInput, UpdateBudgetCategoryInput, BudgetTx } from '../types';

export function useCreateBudgetCategory() {
  return useDomainMutation('budgetCategory', async (category: CreateBudgetCategoryInput) => {
    return apiPost<BudgetCategory>('/api/budget/categories', category);
  });
}

export function useDeleteBudgetTransaction() {
  return useDomainMutation('budgetTransaction', async (id: number) => {
    await api.delete(`/api/budget/transactions/${id}`);
  });
}

export function useUpdateBudgetCategory() {
  return useDomainMutation(
    'budgetCategory',
    async ({ id, ...category }: UpdateBudgetCategoryInput) => {
      return apiPatch<BudgetCategory>(`/api/budget/categories/${id}`, category);
    },
  );
}

export function useUpdateBudgetTransaction() {
  return useDomainMutation(
    'budgetTransaction',
    async ({ id, categoryId }: { id: number; categoryId: number }) => {
      return apiPatch<BudgetTx>(`/api/budget/transactions/${id}`, { categoryId });
    },
  );
}
