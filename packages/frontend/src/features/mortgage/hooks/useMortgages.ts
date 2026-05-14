import { useQuery } from '@tanstack/react-query';
import type { Mortgage as MortgageType } from '@quro/shared';
import { api } from '@/lib/api';
import { normalizeMortgage } from '../utils/mortgage-normalizers';

async function fetchMortgages(includeArchived: boolean): Promise<MortgageType[]> {
  const { data } = await api.get('/api/mortgages', {
    params: includeArchived ? { includeArchived: true } : undefined,
  });
  return (data.data as MortgageType[]).map(normalizeMortgage);
}

export function useMortgages() {
  return useQuery({
    queryKey: ['mortgages'],
    queryFn: () => fetchMortgages(false),
  });
}

export function useArchivedMortgages() {
  return useQuery({
    queryKey: ['mortgages', 'archived'],
    queryFn: async () => (await fetchMortgages(true)).filter((m) => m.archivedAt != null),
  });
}
