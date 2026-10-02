import { queryKeys } from '@/lib/queryKeys';
import { apiGet } from '@/lib/api';
import { useQuery } from '@tanstack/react-query';
import type { Debt } from '@quro/shared';
import { normalizeDebt } from '../utils/debt-normalizers';

async function fetchDebts(includeArchived: boolean): Promise<Debt[]> {
  const payload = await apiGet<Debt[]>('/api/debts', {
    params: includeArchived ? { includeArchived: true } : undefined,
  });
  return payload.map(normalizeDebt);
}

export function useDebts() {
  return useQuery({
    queryKey: queryKeys.debts.all,
    queryFn: () => fetchDebts(false),
  });
}

export function useArchivedDebts() {
  return useQuery({
    queryKey: queryKeys.debts.archived,
    queryFn: async () => (await fetchDebts(true)).filter((d) => d.archivedAt != null),
  });
}
