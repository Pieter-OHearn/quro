import { queryKeys } from '@/lib/queryKeys';
import { apiGet } from '@/lib/api';
import { useQuery } from '@tanstack/react-query';
import type { Goal } from '@quro/shared';
import { normalizeGoal } from './goal-normalizer';

export function useGoals() {
  return useQuery({
    queryKey: queryKeys.goals,
    queryFn: async () => {
      const payload = await apiGet<Goal[]>('/api/goals');
      return payload.map(normalizeGoal);
    },
  });
}
