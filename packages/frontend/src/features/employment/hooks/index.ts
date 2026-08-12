import type { Employment, EmploymentInput, EmploymentPatch } from '@quro/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export const EMPLOYMENTS_QUERY_KEY = ['employments'] as const;

function useEmploymentInvalidation() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: EMPLOYMENTS_QUERY_KEY }),
      queryClient.invalidateQueries({ queryKey: ['plan'] }),
      queryClient.invalidateQueries({ queryKey: ['salary'] }),
    ]);
}

export function useEmployments() {
  return useQuery({
    queryKey: EMPLOYMENTS_QUERY_KEY,
    queryFn: async () => {
      const response = await api.get('/api/employments');
      return response.data.data as Employment[];
    },
  });
}

export function useCreateEmployment() {
  const invalidate = useEmploymentInvalidation();
  return useMutation({
    mutationFn: async (input: EmploymentInput) => {
      const response = await api.post('/api/employments', input);
      return response.data.data as Employment;
    },
    onSuccess: invalidate,
  });
}

export function useUpdateEmployment() {
  const invalidate = useEmploymentInvalidation();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: number; patch: EmploymentPatch }) => {
      const response = await api.patch(`/api/employments/${id}`, patch);
      return response.data.data as Employment;
    },
    onSuccess: invalidate,
  });
}
