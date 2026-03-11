import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Debt } from '@quro/shared';
import { api } from '@/lib/api';
import type { UpdateDebtPayload } from '../types';
import { normalizeDebt } from '../utils/debt-normalizers';

export function useUpdateDebt() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...debt }: UpdateDebtPayload) => {
      const { data } = await api.patch(`/api/debts/${id}`, debt);
      return normalizeDebt(data.data as Debt);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['debts'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}
