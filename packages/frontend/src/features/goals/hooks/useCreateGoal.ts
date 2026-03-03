import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { ApiGoal, CreateGoalInput } from '../types';
import { normalizeGoal } from './goal-normalizer';

export function useCreateGoal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (goal: CreateGoalInput) => {
      const { data } = await api.post('/api/goals', goal);
      return normalizeGoal(data.data as ApiGoal);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['goals'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}
