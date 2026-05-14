import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Holding } from '@quro/shared';
import { normalizeHolding } from '../utils/normalizers';

async function fetchHoldings(includeArchived: boolean): Promise<Holding[]> {
  const { data } = await api.get('/api/investments/holdings', {
    params: includeArchived ? { includeArchived: true } : undefined,
  });
  return (data.data as Holding[]).map(normalizeHolding);
}

export function useHoldings() {
  return useQuery({
    queryKey: ['investments', 'holdings'],
    queryFn: () => fetchHoldings(false),
  });
}

export function useArchivedHoldings() {
  return useQuery({
    queryKey: ['investments', 'holdings', 'archived'],
    queryFn: async () => (await fetchHoldings(true)).filter((h) => h.archivedAt != null),
  });
}
