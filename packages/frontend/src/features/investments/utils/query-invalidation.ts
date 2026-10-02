import type { QueryClient } from '@tanstack/react-query';

export function invalidateInvestmentQueries(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: ['investments'] });
  // Property repayments affect the linked mortgage ledger; metadata edits
  // can also change its address, value, currency or household ownership.
  void queryClient.invalidateQueries({ queryKey: ['mortgages'] });
  void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
}
