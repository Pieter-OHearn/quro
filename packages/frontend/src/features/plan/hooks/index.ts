import type {
  BudgetCategory,
  ExpenseClass,
  PlanAssumptions,
  PlanAssumptionsInput,
  RunwayResponse,
} from '@quro/shared';
import { apiPatch, apiGet, apiPut } from '@/lib/api';
import { useDomainMutation } from '@/lib/useDomainMutation';
import { queryKeys } from '@/lib/queryKeys';
import { useQuery } from '@tanstack/react-query';

export const PLAN_QUERY_KEY = queryKeys.plan.all;

export function useRunway() {
  return useQuery({
    queryKey: queryKeys.plan.runway,
    queryFn: async () => {
      return apiGet<RunwayResponse>('/api/plan/runway');
    },
  });
}

export function usePlanAssumptions() {
  return useQuery({
    queryKey: queryKeys.plan.assumptions,
    queryFn: async () => {
      return apiGet<PlanAssumptions | null>('/api/plan/assumptions');
    },
  });
}

export function useUpdateAssumptions() {
  return useDomainMutation('plan', async (input: PlanAssumptionsInput) => {
    return apiPut<PlanAssumptions>('/api/plan/assumptions', input);
  });
}

export function useAllBudgetCategories() {
  return useQuery({
    queryKey: queryKeys.budget.allCategories,
    queryFn: () => apiGet<BudgetCategory[]>('/api/budget/categories'),
  });
}

export function useClassifyBudgetCategories() {
  return useDomainMutation(
    'budgetClassification',
    (updates: Array<{ id: number; expenseClass: ExpenseClass }>) =>
      apiPatch<BudgetCategory[]>('/api/budget/categories/classify', { updates }),
  );
}
