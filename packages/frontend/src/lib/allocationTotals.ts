import type { DashboardAllocationsSummary } from '@quro/shared';

export function allocationTotals(
  summary: DashboardAllocationsSummary | null | undefined,
  convertToBase: (amount: number, currency: string) => number,
): { portfolioTotal: number; netWorth: number } {
  if (!summary) return { portfolioTotal: 0, netWorth: 0 };
  return {
    portfolioTotal: convertToBase(summary.portfolioTotal, summary.currency),
    netWorth: convertToBase(summary.netWorth, summary.currency),
  };
}
