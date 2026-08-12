import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { ApiPayslip, SavePayslipInput } from '../types';
import { normalizePayslip } from '../utils/normalizers';
import { salaryQueryKeys } from './queryKeys';

export function useCreatePayslip() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payslip: SavePayslipInput) => {
      const { data } = await api.post('/api/salary/payslips', payslip);
      return normalizePayslip(data.data as ApiPayslip);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: salaryQueryKeys.all });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      void queryClient.invalidateQueries({ queryKey: ['plan'] });
    },
  });
}
