import { queryKeys } from '@/lib/queryKeys';
import { apiGet } from '@/lib/api';
import { useQuery } from '@tanstack/react-query';
import type { SetupProgress } from '@quro/shared';

export function useSetupProgress() {
  return useQuery({
    queryKey: queryKeys.dashboard.setup,
    queryFn: () => apiGet<SetupProgress>('/api/dashboard/setup'),
  });
}
