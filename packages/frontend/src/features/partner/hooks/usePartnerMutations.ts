import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { PartnerLink } from '@quro/shared';
import { api } from '@/lib/api';

function invalidatePartnerOnly(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: ['partner'] });
}

// Accepting or unlinking changes which assets are visible, so every asset
// feature and the dashboard must refetch.
function invalidatePartnerAndAssets(queryClient: QueryClient): void {
  invalidatePartnerOnly(queryClient);
  void queryClient.invalidateQueries({ queryKey: ['savings'] });
  void queryClient.invalidateQueries({ queryKey: ['investments'] });
  void queryClient.invalidateQueries({ queryKey: ['mortgages'] });
  void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
}

export function useInvitePartner() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (email: string): Promise<PartnerLink> => {
      const { data } = await api.post('/api/partner/invite', { email });
      return data.data as PartnerLink;
    },
    onSuccess: () => invalidatePartnerOnly(queryClient),
  });
}

export function useAcceptPartner() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<PartnerLink> => {
      const { data } = await api.post('/api/partner/accept');
      return data.data as PartnerLink;
    },
    onSuccess: () => invalidatePartnerAndAssets(queryClient),
  });
}

export function useDeclinePartner() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<void> => {
      await api.post('/api/partner/decline');
    },
    onSuccess: () => invalidatePartnerOnly(queryClient),
  });
}

export function useUnlinkPartner() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<void> => {
      await api.delete('/api/partner');
    },
    onSuccess: () => invalidatePartnerAndAssets(queryClient),
  });
}
