import { useMutation, useQueryClient } from '@tanstack/react-query';
import { invalidateDomain, type MutationDomain } from './queryInvalidation';

export function useDomainMutation<TData, TVariables = void>(
  domain: MutationDomain,
  mutationFn: (variables: TVariables) => Promise<TData>,
) {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn, onSuccess: () => invalidateDomain(queryClient, domain) });
}
