import { useQuery } from '@tanstack/react-query';
import type { MortgageTransaction } from '@quro/shared';
import { api } from '@/lib/api';
import { normalizeMortgageTransaction } from '../utils/mortgage-normalizers';

export function useMortgageTransactions(mortgageId?: number) {
  return useQuery({
    queryKey: ['mortgages', 'transactions', mortgageId],
    queryFn: async () => {
      const params = mortgageId ? { mortgageId } : {};
      const { data } = await api.get('/api/mortgages/transactions', {
        params,
      });
      return (data.data as MortgageTransaction[]).map(normalizeMortgageTransaction);
    },
  });
}
