import { useQuery } from '@tanstack/react-query';
import type { NetWorthSnapshot } from '@quro/shared';
import { api } from '@/lib/api';

export function useNetWorthSnapshots() {
  return useQuery({
    queryKey: ['dashboard', 'netWorth'],
    queryFn: async () => {
      const { data } = await api.get('/api/dashboard/net-worth');
      return data.data as NetWorthSnapshot[];
    },
  });
}
