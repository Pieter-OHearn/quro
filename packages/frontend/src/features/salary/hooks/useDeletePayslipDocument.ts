import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { salaryQueryKeys } from './queryKeys';

export function useDeletePayslipDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payslipId: number) => {
      await api.delete(`/api/salary/payslips/${payslipId}/document`);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: salaryQueryKeys.all });
    },
  });
}
