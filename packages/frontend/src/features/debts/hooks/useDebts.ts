import { useQuery } from '@tanstack/react-query';
import type { Debt } from '@quro/shared';
import { api } from '@/lib/api';
import { normalizeDebt } from '../utils/debt-normalizers';

async function fetchDebts(includeArchived: boolean): Promise<Debt[]> {
  const { data } = await api.get('/api/debts', {
    params: includeArchived ? { includeArchived: true } : undefined,
  });
  return (data.data as Debt[]).map(normalizeDebt);
}

export function useDebts() {
  return useQuery({
    queryKey: ['debts'],
    queryFn: () => fetchDebts(false),
  });
}

export function useArchivedDebts() {
  return useQuery({
    queryKey: ['debts', 'archived'],
    queryFn: async () => (await fetchDebts(true)).filter((d) => d.archivedAt != null),
  });
}
