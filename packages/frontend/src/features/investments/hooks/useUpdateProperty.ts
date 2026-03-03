import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Property } from '@quro/shared';
import { normalizeProperty } from '../utils/normalizers';
import { invalidateInvestmentQueries } from '../utils/query-invalidation';

export function useUpdateProperty() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...property }: Property) => {
      const { data } = await api.patch(`/api/investments/properties/${id}`, property);
      return normalizeProperty(data.data as Property);
    },
    onSuccess: () => {
      invalidateInvestmentQueries(queryClient);
    },
  });
}
