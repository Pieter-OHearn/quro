import { queryKeys } from '@/lib/queryKeys';
import { apiGet } from '@/lib/api';
import { useQuery } from '@tanstack/react-query';
import type { Property } from '@quro/shared';
import { normalizeProperty } from '../utils/normalizers';

async function fetchProperties(includeArchived: boolean): Promise<Property[]> {
  const payload = await apiGet<Property[]>('/api/investments/properties', {
    params: includeArchived ? { includeArchived: true } : undefined,
  });
  return payload.map(normalizeProperty);
}

export function useProperties() {
  return useQuery({
    queryKey: queryKeys.investments.properties,
    queryFn: () => fetchProperties(false),
  });
}

export function useArchivedProperties() {
  return useQuery({
    queryKey: queryKeys.investments.archivedProperties,
    queryFn: async () => (await fetchProperties(true)).filter((p) => p.archivedAt != null),
  });
}
