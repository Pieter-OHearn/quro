import { apiGetAllPages } from '@/lib/api';
import { useQuery } from '@tanstack/react-query';
import type { ApiPayslip } from '../types';
import { normalizePayslip } from '../utils/normalizers';
import { queryKeys } from '@/lib/queryKeys';

export function usePayslips() {
  return useQuery({
    queryKey: queryKeys.salary.payslips,
    queryFn: async ({ signal }) => {
      const payload = await apiGetAllPages<ApiPayslip>('/api/salary/payslips', { signal });
      return payload.map(normalizePayslip);
    },
  });
}
