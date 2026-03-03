import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Property } from '@quro/shared';
import { normalizeProperty } from '../utils/normalizers';

export function useProperties() {
  return useQuery({
    queryKey: ['investments', 'properties'],
    queryFn: async () => {
      const { data } = await api.get('/api/investments/properties');
      return (data.data as Property[]).map(normalizeProperty);
    },
  });
}
