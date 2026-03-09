import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { ApiPayslip, SavePayslipInput } from '../types';
import { normalizePayslip } from '../utils/normalizers';
import { salaryQueryKeys } from './queryKeys';

type UpdatePayslipInput = {
  id: number;
  payslip: SavePayslipInput;
};

export function useUpdatePayslip() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, payslip }: UpdatePayslipInput) => {
      const { data } = await api.patch(`/api/salary/payslips/${id}`, payslip);
      return normalizePayslip(data.data as ApiPayslip);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: salaryQueryKeys.all });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}
