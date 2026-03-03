import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { MortgageTransaction } from '@quro/shared';
import { api } from '@/lib/api';
import { normalizeMortgageTransaction } from '../utils/mortgage-normalizers';

export function useCreateMortgageTransaction() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (txn: Omit<MortgageTransaction, 'id'>) => {
      const { data } = await api.post('/api/mortgages/transactions', txn);
      return normalizeMortgageTransaction(data.data as MortgageTransaction);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['mortgages'] });
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}
