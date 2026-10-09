import { useQuery } from '@tanstack/react-query';
import type { UserSession } from '@quro/shared';
import { apiDelete, apiGet } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';
import { useDomainMutation } from '@/lib/useDomainMutation';

export function useSessions() {
  return useQuery({
    queryKey: queryKeys.sessions,
    queryFn: () => apiGet<UserSession[]>('/api/settings/sessions'),
  });
}

export function useRevokeSession() {
  return useDomainMutation('sessions', (id: string) =>
    apiDelete<null>(`/api/settings/sessions/${encodeURIComponent(id)}`),
  );
}

/** Signs out every browser of this account except the current one. */
export function useRevokeOtherSessions() {
  return useDomainMutation('sessions', () =>
    apiDelete<{ revoked: number }>('/api/settings/sessions'),
  );
}
