import type {
  EmploymentProfile,
  EmploymentProfileInput,
  PlanAssumptions,
  PlanAssumptionsInput,
  RunwayResponse,
} from '@quro/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export const PLAN_QUERY_KEY = ['plan'] as const;

export function useRunway() {
  return useQuery({
    queryKey: [...PLAN_QUERY_KEY, 'runway'],
    queryFn: async () => {
      const response = await api.get('/api/plan/runway');
      return response.data.data as RunwayResponse;
    },
  });
}

export function usePlanAssumptions() {
  return useQuery({
    queryKey: [...PLAN_QUERY_KEY, 'assumptions'],
    queryFn: async () => {
      const response = await api.get('/api/plan/assumptions');
      return response.data.data as PlanAssumptions | null;
    },
  });
}

function usePlanInvalidation() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: PLAN_QUERY_KEY }),
      queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
    ]);
}

export function useUpdateEmployment() {
  const invalidate = usePlanInvalidation();
  return useMutation({
    mutationFn: async (input: EmploymentProfileInput) => {
      const response = await api.put('/api/plan/employment', input);
      return response.data.data as EmploymentProfile;
    },
    onSuccess: invalidate,
  });
}

export function useUpdateAssumptions() {
  const invalidate = usePlanInvalidation();
  return useMutation({
    mutationFn: async (input: PlanAssumptionsInput) => {
      const response = await api.put('/api/plan/assumptions', input);
      return response.data.data as PlanAssumptions;
    },
    onSuccess: invalidate,
  });
}
