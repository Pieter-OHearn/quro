import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Holding } from '@quro/shared';
import { normalizeHolding } from '../utils/normalizers';
import { invalidateInvestmentQueries } from '../utils/query-invalidation';

export function useCreateHolding() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (holding: Omit<Holding, 'id'>) => {
      const { data } = await api.post('/api/investments/holdings', holding);
      return normalizeHolding(data.data as Holding);
    },
    onSuccess: () => {
      invalidateInvestmentQueries(queryClient);
    },
  });
}
