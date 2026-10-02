import { apiGet } from '@/lib/api';
import { useQuery } from '@tanstack/react-query';
import type { ApiSalaryHistory } from '../types';
import { queryKeys } from '@/lib/queryKeys';

export function useSalaryHistory() {
  return useQuery({
    queryKey: queryKeys.salary.history,
    queryFn: async () => {
      return apiGet<ApiSalaryHistory[]>('/api/salary/history');
    },
  });
}
