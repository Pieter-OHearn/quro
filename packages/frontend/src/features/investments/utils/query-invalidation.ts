import type { QueryClient } from '@tanstack/react-query';

export function invalidateInvestmentQueries(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: ['investments'] });
  void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
}
