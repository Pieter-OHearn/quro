import { useDashboardSummary } from './useDashboardSummary';

export function useNetWorthSnapshots() {
  return useDashboardSummary((summary) => summary.netWorth);
}
