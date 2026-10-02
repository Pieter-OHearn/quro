import { queryKeys } from '@/lib/queryKeys';
import { apiGet } from '@/lib/api';
import { useQuery } from '@tanstack/react-query';
import type { DebtPayment } from '@quro/shared';
import { normalizeDebtPayment } from '../utils/debt-normalizers';

export function useDebtPayments(debtId?: number) {
  return useQuery({
    queryKey: queryKeys.debts.payments(debtId ?? 'all'),
    queryFn: async () => {
      const payload = await apiGet<DebtPayment[]>('/api/debts/payments', {
        params: debtId ? { debtId } : undefined,
      });
      return payload.map(normalizeDebtPayment);
    },
  });
}
