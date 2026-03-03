import { useQuery } from '@tanstack/react-query';
import type { AssetAllocation } from '@quro/shared';
import { api } from '@/lib/api';

export function useAssetAllocations() {
  return useQuery({
    queryKey: ['dashboard', 'allocations'],
    queryFn: async () => {
      const { data } = await api.get('/api/dashboard/allocations');
      return data.data as AssetAllocation[];
    },
  });
}
