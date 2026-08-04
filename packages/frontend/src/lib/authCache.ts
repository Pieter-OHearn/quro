import { queryClient } from './queryClient';

export function clearAuthQueryCache(): void {
  queryClient.clear();
}
