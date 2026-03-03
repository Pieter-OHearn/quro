import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { normalizeGoal, type ApiGoal } from './goal-normalizer';

export function useGoalsSummary() {
  return useQuery({
    queryKey: ['dashboard', 'goals'],
    queryFn: async () => {
      const { data } = await api.get('/api/goals');
      return (data.data as ApiGoal[]).map(normalizeGoal);
    },
  });
}
