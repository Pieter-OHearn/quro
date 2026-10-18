import { useQuery } from '@tanstack/react-query';
import type { SingleSignOnLink } from '@quro/shared';
import { apiDelete, apiGet } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';
import { useDomainMutation } from '@/lib/useDomainMutation';

/** Whether this account is linked to the single sign-on provider. */
export function useSingleSignOnLink() {
  return useQuery({
    queryKey: queryKeys.singleSignOn,
    queryFn: () => apiGet<SingleSignOnLink>('/api/settings/single-sign-on'),
  });
}

/** Removes the link; the password proves it is the account holder. */
export function useUnlinkSingleSignOn() {
  return useDomainMutation('singleSignOn', (password: string) =>
    apiDelete<SingleSignOnLink>('/api/settings/single-sign-on', { data: { password } }),
  );
}
