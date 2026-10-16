import { queryKeys } from './queryKeys';
import { apiGet } from './api';
import { useQuery, type QueryClient } from '@tanstack/react-query';
import type { AppCapabilities, AppCapabilityStatus } from '@quro/shared';

export const APP_CAPABILITIES_QUERY_KEY = queryKeys.capabilities;

export const DEFAULT_APP_CAPABILITIES: AppCapabilities = {
  pensionStatementImport: {
    enabled: false,
    reason: 'not_configured',
    message: 'Statement import is not set up on this Quro server.',
    lifecycle: 'experimental',
    checkedAt: new Date(0).toISOString(),
  },
  bunq: {
    enabled: false,
    reason: 'not_configured',
    message: 'Bunq linking is unavailable because this Quro instance has not configured it.',
    lifecycle: 'stable',
    checkedAt: new Date(0).toISOString(),
  },
  documents: {
    enabled: false,
    reason: 'not_configured',
    message: 'Document storage is not configured.',
    lifecycle: 'stable',
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
 * The capabilities from the cache, fetched first when there are none yet, or null when they
 * cannot be read. Hooks for optional routes call this before their request: a capability that
 * is not configured has no routes, and calling them only produces 404s. When the capabilities
 * are unknown the hooks make their request as before, so a failed capabilities read does not
 * turn into a second failure.
 */
export async function loadAppCapabilities(
  queryClient: QueryClient,
): Promise<AppCapabilities | null> {
  try {
    return await queryClient.ensureQueryData({
      queryKey: APP_CAPABILITIES_QUERY_KEY,
      queryFn: fetchCapabilities,
    });
  } catch {
    return null;
  }
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
