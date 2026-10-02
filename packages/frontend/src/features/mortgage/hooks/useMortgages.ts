import { queryKeys } from '@/lib/queryKeys';
import { apiGet } from '@/lib/api';
import { useQuery } from '@tanstack/react-query';
import type { Mortgage as MortgageType } from '@quro/shared';

async function fetchMortgages(includeArchived: boolean): Promise<MortgageType[]> {
  return apiGet<MortgageType[]>('/api/mortgages', {
    params: includeArchived ? { includeArchived: true } : undefined,
  });
}

export function useMortgages() {
  return useQuery({
    queryKey: queryKeys.mortgages.all,
    queryFn: () => fetchMortgages(false),
  });
}

export function useArchivedMortgages() {
  return useQuery({
    queryKey: queryKeys.mortgages.archived,
    queryFn: async () => (await fetchMortgages(true)).filter((m) => m.archivedAt != null),
  });
}
