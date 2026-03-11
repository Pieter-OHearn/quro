import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Debt } from '@quro/shared';
import { api } from '@/lib/api';
import type { CreateDebtPayload } from '../types';
import { normalizeDebt } from '../utils/debt-normalizers';

export function useCreateDebt() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (debt: CreateDebtPayload) => {
      const { data } = await api.post('/api/debts', debt);
      return normalizeDebt(data.data as Debt);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['debts'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}
