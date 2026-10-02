import { queryKeys } from '@/lib/queryKeys';
import { apiGet } from '@/lib/api';
import axios from 'axios';
import { useQuery } from '@tanstack/react-query';
import type { BunqConnection } from '@quro/shared';

export function useBunqConnection() {
  return useQuery({
    queryKey: queryKeys.bunqConnection,
    queryFn: async (): Promise<BunqConnection | null> => {
      try {
        return apiGet<BunqConnection>('/api/bunq/connection');
      } catch (error: unknown) {
        if (axios.isAxiosError(error) && error.response?.status === 404) return null;
        throw error;
      }
    },
  });
}
