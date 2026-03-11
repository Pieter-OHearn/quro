import { useQuery } from '@tanstack/react-query';
import type { DebtPayment } from '@quro/shared';
import { api } from '@/lib/api';
import { normalizeDebtPayment } from '../utils/debt-normalizers';

export function useDebtPayments(debtId?: number) {
  return useQuery({
    queryKey: ['debts', 'payments', debtId ?? 'all'],
    queryFn: async () => {
      const { data } = await api.get('/api/debts/payments', {
        params: debtId ? { debtId } : undefined,
      });
      return (data.data as DebtPayment[]).map(normalizeDebtPayment);
    },
  });
}
