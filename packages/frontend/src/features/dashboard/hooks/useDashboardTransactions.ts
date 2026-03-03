import { useQuery } from '@tanstack/react-query';
import type { DashboardTransaction } from '@quro/shared';
import { api } from '@/lib/api';

export function useDashboardTransactions() {
  return useQuery({
    queryKey: ['dashboard', 'transactions'],
    queryFn: async () => {
      const { data } = await api.get('/api/dashboard/transactions');
      return data.data as DashboardTransaction[];
    },
  });
}
