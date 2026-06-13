import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { MortgageTransaction } from '@quro/shared';
import { api } from '@/lib/api';
import { normalizeMortgageTransaction } from '../utils/mortgage-normalizers';

export function useUpdateMortgageTransaction() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...txn }: MortgageTransaction) => {
      const { data } = await api.patch(`/api/mortgages/transactions/${id}`, txn);
      return normalizeMortgageTransaction(data.data as MortgageTransaction);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['mortgages'] });
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}
