import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { ApiPensionPot } from '../types';
import { normalizePensionPot } from '../utils/pension-api-normalizers';

async function fetchPensionPots(includeArchived: boolean) {
  const { data } = await api.get('/api/pensions/pots', {
    params: includeArchived ? { includeArchived: true } : undefined,
  });
  return (data.data as ApiPensionPot[]).map(normalizePensionPot).filter((pot) => pot.id > 0);
}

export function usePensionPots() {
  return useQuery({
    queryKey: ['pensions', 'pots'],
    queryFn: () => fetchPensionPots(false),
  });
}

export function useArchivedPensionPots() {
  return useQuery({
    queryKey: ['pensions', 'pots', 'archived'],
    queryFn: async () => (await fetchPensionPots(true)).filter((pot) => pot.archivedAt != null),
  });
}
