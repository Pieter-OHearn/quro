import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Goal } from '@quro/shared';
import { normalizeGoal } from '@/features/goals/hooks/goal-normalizer';

export function useGoalsSummary() {
  return useQuery({
    queryKey: ['dashboard', 'goals'],
    queryFn: async () => {
      const { data } = await api.get('/api/goals');
      return (data.data as Goal[]).map(normalizeGoal);
    },
  });
}
