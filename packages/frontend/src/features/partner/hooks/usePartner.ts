import { useQuery } from '@tanstack/react-query';
import type { PartnerLink } from '@quro/shared';
import { api } from '@/lib/api';

export function usePartner() {
  return useQuery({
    queryKey: ['partner'],
    queryFn: async (): Promise<PartnerLink | null> => {
      const { data } = await api.get('/api/partner');
      return (data.data as PartnerLink | null) ?? null;
    },
  });
}
