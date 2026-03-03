import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Holding } from '@quro/shared';
import { normalizeHolding } from '../utils/normalizers';
import { invalidateInvestmentQueries } from '../utils/query-invalidation';

export function useUpdateHolding() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...holding }: Holding) => {
      const { data } = await api.patch(`/api/investments/holdings/${id}`, holding);
      return normalizeHolding(data.data as Holding);
    },
    onSuccess: () => {
      invalidateInvestmentQueries(queryClient);
    },
  });
}
