import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Property } from '@quro/shared';
import { normalizeProperty } from '../utils/normalizers';
import { invalidateInvestmentQueries } from '../utils/query-invalidation';

export function useCreateProperty() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (property: Omit<Property, 'id'>) => {
      const { data } = await api.post('/api/investments/properties', property);
      return normalizeProperty(data.data as Property);
    },
    onSuccess: () => {
      invalidateInvestmentQueries(queryClient);
    },
  });
}
