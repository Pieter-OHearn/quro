import { useQuery } from '@tanstack/react-query';
import type { Debt } from '@quro/shared';
import { api } from '@/lib/api';
import { normalizeDebt } from '../utils/debt-normalizers';

export function useDebts() {
  return useQuery({
    queryKey: ['debts'],
    queryFn: async () => {
      const { data } = await api.get('/api/debts');
      return (data.data as Debt[]).map(normalizeDebt);
    },
  });
}
