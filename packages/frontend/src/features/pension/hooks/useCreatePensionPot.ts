import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { PensionPot } from '@quro/shared';
import { invalidatePensionQueries } from '../utils/pension-query-invalidation';

export function useCreatePensionPot() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (pot: Omit<PensionPot, 'id'>) => {
      const { data } = await api.post('/api/pensions/pots', pot);
      return data.data;
    },
    onSuccess: () => {
      invalidatePensionQueries(queryClient);
    },
  });
}
