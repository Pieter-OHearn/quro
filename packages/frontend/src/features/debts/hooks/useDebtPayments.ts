import { queryKeys } from '@/lib/queryKeys';
import { apiGetAllPages } from '@/lib/api';
import { useQuery } from '@tanstack/react-query';
import type { DebtPayment } from '@quro/shared';
import { normalizeDebtPayment } from '../utils/debt-normalizers';

export function useDebtPayments(debtId?: number) {
  return useQuery({
    queryKey: queryKeys.debts.payments(debtId ?? 'all'),
    queryFn: async ({ signal }) => {
      const payload = await apiGetAllPages<DebtPayment>('/api/debts/payments', {
        params: debtId ? { debtId } : undefined,
        signal,
      });
      return payload.map(normalizeDebtPayment);
    },
  });
}
