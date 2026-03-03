import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { SalaryHistory } from '@quro/shared';
import { api } from '@/lib/api';
import type { ApiSalaryHistory } from '../types';
import { normalizeSalaryHistory } from '../utils/normalizers';
import { salaryQueryKeys } from './queryKeys';

export function useCreateSalaryHistory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (entry: Omit<SalaryHistory, 'id'>) => {
      const { data } = await api.post('/api/salary/history', entry);
      return normalizeSalaryHistory(data.data as ApiSalaryHistory);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: salaryQueryKeys.all });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}
