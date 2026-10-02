import { useDashboardSummary } from './useDashboardSummary';

export function useAssetAllocations() {
  return useDashboardSummary((summary) => summary.allocations);
}
