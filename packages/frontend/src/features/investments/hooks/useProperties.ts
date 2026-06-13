import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Property } from '@quro/shared';
import { normalizeProperty } from '../utils/normalizers';

async function fetchProperties(includeArchived: boolean): Promise<Property[]> {
  const { data } = await api.get('/api/investments/properties', {
    params: includeArchived ? { includeArchived: true } : undefined,
  });
  return (data.data as Property[]).map(normalizeProperty);
}

export function useProperties() {
  return useQuery({
    queryKey: ['investments', 'properties'],
    queryFn: () => fetchProperties(false),
  });
}

export function useArchivedProperties() {
  return useQuery({
    queryKey: ['investments', 'properties', 'archived'],
    queryFn: async () => (await fetchProperties(true)).filter((p) => p.archivedAt != null),
  });
}
