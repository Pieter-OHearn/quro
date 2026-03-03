import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { ApiGoal } from '../types';
import { normalizeGoal } from './goal-normalizer';

export function useGoals() {
  return useQuery({
    queryKey: ['goals'],
    queryFn: async () => {
      const { data } = await api.get('/api/goals');
      return (data.data as ApiGoal[]).map(normalizeGoal);
    },
  });
}
