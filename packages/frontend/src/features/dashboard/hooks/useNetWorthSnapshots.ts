import { useDashboardSummary } from './useDashboardSummary';

export function useNetWorthSnapshots() {
  return useDashboardSummary((summary) => summary.netWorth);
}

export function useNetWorthYearStart() {
  return useDashboardSummary((summary) => summary.yearStart);
}
