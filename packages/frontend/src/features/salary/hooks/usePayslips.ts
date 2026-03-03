import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { ApiPayslip } from '../types';
import { normalizePayslip } from '../utils/normalizers';
import { salaryQueryKeys } from './queryKeys';

export function usePayslips() {
  return useQuery({
    queryKey: salaryQueryKeys.payslips,
    queryFn: async () => {
      const { data } = await api.get('/api/salary/payslips');
      return (data.data as ApiPayslip[]).map(normalizePayslip);
    },
  });
}
