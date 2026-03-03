import type { QueryClient } from '@tanstack/react-query';

export function invalidatePensionQueries(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: ['pensions'] });
  void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
}
