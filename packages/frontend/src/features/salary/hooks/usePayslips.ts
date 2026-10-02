import { apiGet } from '@/lib/api';
import { useQuery } from '@tanstack/react-query';
import type { ApiPayslip } from '../types';
import { normalizePayslip } from '../utils/normalizers';
import { queryKeys } from '@/lib/queryKeys';

export function usePayslips() {
  return useQuery({
    queryKey: queryKeys.salary.payslips,
    queryFn: async () => {
      const payload = await apiGet<ApiPayslip[]>('/api/salary/payslips');
      return payload.map(normalizePayslip);
    },
  });
}
