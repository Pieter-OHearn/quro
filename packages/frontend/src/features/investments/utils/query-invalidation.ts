import type { QueryClient } from '@tanstack/react-query';

export function invalidateInvestmentQueries(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: ['investments'] });
  // Property edits sync the linked mortgage snapshot, so mortgage views must
  // refresh too.
  void queryClient.invalidateQueries({ queryKey: ['mortgages'] });
  void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
}
