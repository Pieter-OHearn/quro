import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Holding } from '@quro/shared';
import { normalizeHolding } from '../utils/normalizers';
import { invalidateInvestmentQueries } from '../utils/query-invalidation';

type CreateHoldingPayload = Omit<Holding, 'id'> & {
  priceCurrency?: string | null;
  eodDate?: string | null;
};

export function useCreateHolding() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (holding: CreateHoldingPayload) => {
      const { data } = await api.post('/api/investments/holdings', holding);
      return normalizeHolding(data.data as Holding);
    },
    onSettled: () => {
      invalidateInvestmentQueries(queryClient);
    },
  });
}
