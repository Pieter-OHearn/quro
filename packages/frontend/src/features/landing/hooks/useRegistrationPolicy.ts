import { useQuery } from '@tanstack/react-query';
import type { PublicAuthPolicy } from '@quro/shared';
import { apiGet } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';

/**
 * Whether this instance takes sign-ups and needs an operator-issued code for them, and whether
 * it offers single sign-on.
 */
export function useRegistrationPolicy() {
  return useQuery({
    queryKey: queryKeys.registrationPolicy,
    queryFn: () => apiGet<PublicAuthPolicy>('/api/auth/registration'),
    staleTime: 0,
  });
}
