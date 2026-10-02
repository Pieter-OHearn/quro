import { queryKeys } from '@/lib/queryKeys';
import { apiGet } from '@/lib/api';
import { useQuery } from '@tanstack/react-query';
import type { Holding } from '@quro/shared';
import { normalizeHolding } from '../utils/normalizers';

async function fetchHoldings(includeArchived: boolean): Promise<Holding[]> {
  const payload = await apiGet<Holding[]>('/api/investments/holdings', {
    params: includeArchived ? { includeArchived: true } : undefined,
  });
  return payload.map(normalizeHolding);
}

export function useHoldings() {
  return useQuery({
    queryKey: queryKeys.investments.holdings,
    queryFn: () => fetchHoldings(false),
  });
}

export function useArchivedHoldings() {
  return useQuery({
    queryKey: queryKeys.investments.archivedHoldings,
    queryFn: async () => (await fetchHoldings(true)).filter((h) => h.archivedAt != null),
  });
}
