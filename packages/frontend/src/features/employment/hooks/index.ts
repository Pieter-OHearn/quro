import { useDomainMutation } from '@/lib/useDomainMutation';
import { queryKeys } from '@/lib/queryKeys';
import { apiGet, apiPost, apiPatch } from '@/lib/api';
import type { Employment, EmploymentInput, EmploymentPatch } from '@quro/shared';
import { useQuery } from '@tanstack/react-query';

export const EMPLOYMENTS_QUERY_KEY = queryKeys.employments;

export function useEmployments() {
  return useQuery({
    queryKey: EMPLOYMENTS_QUERY_KEY,
    queryFn: async () => {
      return apiGet<Employment[]>('/api/employments');
    },
  });
}

export function useCreateEmployment() {
  return useDomainMutation('employment', async (input: EmploymentInput) => {
    return apiPost<Employment>('/api/employments', input);
  });
}

export function useUpdateEmployment() {
  return useDomainMutation(
    'employment',
    async ({ id, patch }: { id: number; patch: EmploymentPatch }) => {
      return apiPatch<Employment>(`/api/employments/${id}`, patch);
    },
  );
}
