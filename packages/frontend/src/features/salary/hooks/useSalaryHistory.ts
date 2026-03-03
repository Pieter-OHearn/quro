import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { ApiSalaryHistory } from '../types';
import { normalizeSalaryHistory } from '../utils/normalizers';
import { salaryQueryKeys } from './queryKeys';

export function useSalaryHistory() {
  return useQuery({
    queryKey: salaryQueryKeys.history,
    queryFn: async () => {
      const { data } = await api.get('/api/salary/history');
      return (data.data as ApiSalaryHistory[]).map(normalizeSalaryHistory);
    },
  });
}
