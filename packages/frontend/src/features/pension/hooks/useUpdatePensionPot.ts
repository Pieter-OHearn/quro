import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { PensionPot } from '@quro/shared';
import { invalidatePensionQueries } from '../utils/pension-query-invalidation';

export function useUpdatePensionPot() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...pot }: PensionPot) => {
      const { data } = await api.patch(`/api/pensions/pots/${id}`, pot);
      return data.data;
    },
    onSuccess: () => {
      invalidatePensionQueries(queryClient);
    },
  });
}
