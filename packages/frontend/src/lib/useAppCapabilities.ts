import { queryKeys } from './queryKeys';
import { apiGet } from './api';
import { useQuery, type QueryClient } from '@tanstack/react-query';
import type { AppCapabilities, AppCapabilityStatus } from '@quro/shared';

export const APP_CAPABILITIES_QUERY_KEY = queryKeys.capabilities;

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
  bunq: {
    enabled: false,
    reason: 'not_configured',
    message: 'Bunq linking is unavailable because this Quro instance has not configured it.',
    checkedAt: new Date(0).toISOString(),
  },
  documents: {
    enabled: false,
    reason: 'not_configured',
    message: 'Document storage is not configured.',
    checkedAt: new Date(0).toISOString(),
  },
};

function fetchCapabilities(): Promise<AppCapabilities> {
  return apiGet<AppCapabilities>('/api/capabilities');
}

export function useAppCapabilities() {
  return useQuery({
    queryKey: APP_CAPABILITIES_QUERY_KEY,
    queryFn: fetchCapabilities,
    refetchInterval: 15_000,
  });
}

/**
 * The capabilities from the cache, fetched first when there are none yet. Hooks for optional
 * routes call this before their request: a capability that is not configured has no routes, and
 * calling them only produces 404s.
 */
export function loadAppCapabilities(queryClient: QueryClient): Promise<AppCapabilities> {
  return queryClient.ensureQueryData({
    queryKey: APP_CAPABILITIES_QUERY_KEY,
    queryFn: fetchCapabilities,
  });
}

export function useBunqAvailability() {
  const { data: capabilities } = useAppCapabilities();
  const bunq: AppCapabilityStatus | undefined = capabilities?.bunq;
  const unavailable = bunq !== undefined && !bunq.enabled;
  const disconnectedMessage =
    unavailable && bunq
      ? bunq.message
      : 'Connect your Bunq account to automatically sync savings and budget transactions.';
  return { unavailable, disconnectedMessage };
}
