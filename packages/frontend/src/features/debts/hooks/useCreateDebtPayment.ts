import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { DebtPayment } from '@quro/shared';
import { api } from '@/lib/api';
import type { CreateDebtPaymentPayload } from '../types';
import { normalizeDebtPayment } from '../utils/debt-normalizers';

export function useCreateDebtPayment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payment: CreateDebtPaymentPayload) => {
      const { data } = await api.post('/api/debts/payments', payment);
      return normalizeDebtPayment(data.data as DebtPayment);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['debts'] });
      void queryClient.invalidateQueries({ queryKey: ['debts', 'payments'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}
