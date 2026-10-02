import { queryKeys } from '@/lib/queryKeys';
import { apiGet } from '@/lib/api';
import { useQuery } from '@tanstack/react-query';
import type { PartnerLink } from '@quro/shared';

export function usePartner() {
  return useQuery({
    queryKey: queryKeys.partner,
    queryFn: async (): Promise<PartnerLink | null> => {
      const payload = await apiGet<PartnerLink | null>('/api/partner');
      return payload ?? null;
    },
  });
}
