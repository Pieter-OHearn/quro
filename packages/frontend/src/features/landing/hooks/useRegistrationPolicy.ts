import { useQuery } from '@tanstack/react-query';
import type { RegistrationPolicy } from '@quro/shared';
import { apiGet } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';

/** Whether this instance takes sign-ups, and whether they need an operator-issued code. */
export function useRegistrationPolicy() {
  return useQuery({
    queryKey: queryKeys.registrationPolicy,
    queryFn: () => apiGet<RegistrationPolicy>('/api/auth/registration'),
    staleTime: 0,
  });
}
