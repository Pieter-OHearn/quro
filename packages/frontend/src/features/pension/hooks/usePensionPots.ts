import { queryKeys } from '@/lib/queryKeys';
import { apiGet } from '@/lib/api';
import { useQuery } from '@tanstack/react-query';
import type { ApiPensionPot } from '../types';
import { normalizePensionPot } from '../utils/pension-api-normalizers';

async function fetchPensionPots(includeArchived: boolean) {
  const payload = await apiGet<ApiPensionPot[]>('/api/pensions/pots', {
    params: includeArchived ? { includeArchived: true } : undefined,
  });
  return payload.map(normalizePensionPot).filter((pot) => pot.id > 0);
}

export function usePensionPots() {
  return useQuery({
    queryKey: queryKeys.pensions.pots,
    queryFn: () => fetchPensionPots(false),
  });
}

export function useArchivedPensionPots() {
  return useQuery({
    queryKey: queryKeys.pensions.archivedPots,
    queryFn: async () => (await fetchPensionPots(true)).filter((pot) => pot.archivedAt != null),
  });
}
