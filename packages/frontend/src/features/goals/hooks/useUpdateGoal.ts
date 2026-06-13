import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Goal } from '@quro/shared';
import type { UpdateGoalInput } from '../types';
import { normalizeGoal } from './goal-normalizer';

export function useUpdateGoal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...goal }: UpdateGoalInput) => {
      const { data } = await api.patch(`/api/goals/${id}`, goal);
      return normalizeGoal(data.data as Goal);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['goals'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}
