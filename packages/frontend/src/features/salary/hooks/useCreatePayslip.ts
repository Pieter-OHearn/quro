import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Payslip } from '@quro/shared';
import { api } from '@/lib/api';
import type { ApiPayslip } from '../types';
import { normalizePayslip } from '../utils/normalizers';
import { salaryQueryKeys } from './queryKeys';

export function useCreatePayslip() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payslip: Omit<Payslip, 'id'>) => {
      const { data } = await api.post('/api/salary/payslips', payslip);
      return normalizePayslip(data.data as ApiPayslip);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: salaryQueryKeys.all });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}
