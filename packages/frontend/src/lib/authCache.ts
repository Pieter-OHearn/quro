import { queryClient } from './queryClient';

export function clearAuthQueryCache(): void {
  queryClient.clear();
}

export function invalidateAuthSession(replaceUser: (user: null) => void): void {
  clearAuthQueryCache();
  replaceUser(null);
}
