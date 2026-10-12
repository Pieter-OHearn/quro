import { queryKeys } from '@/lib/queryKeys';
import { apiGet } from '@/lib/api';
import { loadAppCapabilities } from '@/lib/useAppCapabilities';
import axios from 'axios';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { BunqConnection } from '@quro/shared';

export function useBunqConnection() {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: queryKeys.bunqConnection,
    queryFn: async (): Promise<BunqConnection | null> => {
      // Without bunq configured the backend has no bunq routes.
      const capabilities = await loadAppCapabilities(queryClient);
      if (capabilities?.bunq.enabled === false) return null;
      try {
        return await apiGet<BunqConnection>('/api/bunq/connection');
      } catch (error: unknown) {
        if (axios.isAxiosError(error) && error.response?.status === 404) return null;
        throw error;
      }
    },
  });
}
