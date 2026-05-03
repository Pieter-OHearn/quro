import axios from 'axios';
import { useQuery } from '@tanstack/react-query';
import type { BunqConnection } from '@quro/shared';
import { api } from '@/lib/api';

export function useBunqConnection() {
  return useQuery({
    queryKey: ['bunq', 'connection'],
    queryFn: async (): Promise<BunqConnection | null> => {
      try {
        const { data } = await api.get('/api/bunq/connection');
        return data.data as BunqConnection;
      } catch (error: unknown) {
        if (axios.isAxiosError(error) && error.response?.status === 404) return null;
        throw error;
      }
    },
  });
}
