import { useMutation, useQueryClient } from '@tanstack/react-query';
import { resetDomain } from '@/lib/queryInvalidation';
import { useDomainMutation } from '@/lib/useDomainMutation';
import { apiPost, api } from '@/lib/api';
import type { PartnerLink } from '@quro/shared';

export function useInvitePartner() {
  return useDomainMutation('partner', async (email: string): Promise<PartnerLink> => {
    return apiPost<PartnerLink>('/api/partner/invite', { email });
  });
}

export function useAcceptPartner() {
  return useDomainMutation('household', async (): Promise<PartnerLink> => {
    return apiPost<PartnerLink>('/api/partner/accept');
  });
}

export function useDeclinePartner() {
  return useDomainMutation('partner', async (): Promise<void> => {
    await api.post('/api/partner/decline');
  });
}

export function useUnlinkPartner() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<void> => {
      await api.delete('/api/partner');
    },
    // The former partner's joint rows must not stay on screen while the lists refetch.
    onSuccess: () => resetDomain(queryClient, 'household'),
  });
}
