import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { salaryQueryKeys } from './queryKeys';

export function useDeletePayslip() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/api/salary/payslips/${id}`);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: salaryQueryKeys.all });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}
