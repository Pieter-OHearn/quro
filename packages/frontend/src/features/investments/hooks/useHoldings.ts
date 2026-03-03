import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Holding } from '@quro/shared';
import { normalizeHolding } from '../utils/normalizers';

export function useHoldings() {
  return useQuery({
    queryKey: ['investments', 'holdings'],
    queryFn: async () => {
      const { data } = await api.get('/api/investments/holdings');
      return (data.data as Holding[]).map(normalizeHolding);
    },
  });
}
