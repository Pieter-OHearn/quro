import { useDomainMutation } from '@/lib/useDomainMutation';
import { apiPost, api, apiPatch } from '@/lib/api';
import type { Goal } from '@quro/shared';
import type { CreateGoalInput, UpdateGoalInput } from '../types';
import { normalizeGoal } from './goal-normalizer';

export function useCreateGoal() {
  return useDomainMutation('goals', async (goal: CreateGoalInput) => {
    const payload = await apiPost<Goal>('/api/goals', goal);
    return normalizeGoal(payload);
  });
}

export function useDeleteGoal() {
  return useDomainMutation('goals', async (id: number) => {
    await api.delete(`/api/goals/${id}`);
  });
}

export function useUpdateGoal() {
  return useDomainMutation('goals', async ({ id, ...goal }: UpdateGoalInput) => {
    const payload = await apiPatch<Goal>(`/api/goals/${id}`, goal);
    return normalizeGoal(payload);
  });
}
