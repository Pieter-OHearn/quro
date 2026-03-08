import { useQuery } from '@tanstack/react-query';
import type { AppCapabilities } from '@quro/shared';
import { api } from './api';

export const APP_CAPABILITIES_QUERY_KEY = ['app', 'capabilities'] as const;

export const DEFAULT_APP_CAPABILITIES: AppCapabilities = {
  ai: {
    enabled: false,
    reason: 'worker_unavailable',
    message: 'AI features are unavailable. Start the pension import worker to enable AI.',
    checkedAt: new Date(0).toISOString(),
  },
  pensionStatementImport: {
    enabled: false,
    reason: 'worker_unavailable',
    message: 'AI import is unavailable. Start the pension import worker to use PDF import.',
    checkedAt: new Date(0).toISOString(),
  },
};

export function useAppCapabilities() {
  return useQuery({
    queryKey: APP_CAPABILITIES_QUERY_KEY,
    queryFn: async (): Promise<AppCapabilities> => {
      const { data } = await api.get('/api/capabilities');
      return data.data as AppCapabilities;
    },
    refetchInterval: 15_000,
  });
}
