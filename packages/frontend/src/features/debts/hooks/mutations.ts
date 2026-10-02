import { useDomainMutation } from '@/lib/useDomainMutation';
import { apiPost, api, apiPatch } from '@/lib/api';
import type { Debt, DebtPayment } from '@quro/shared';
import type { CreateDebtPayload, CreateDebtPaymentPayload, UpdateDebtPayload } from '../types';
import { normalizeDebt, normalizeDebtPayment } from '../utils/debt-normalizers';

export function useCreateDebt() {
  return useDomainMutation('debt', async (debt: CreateDebtPayload) => {
    const payload = await apiPost<Debt>('/api/debts', debt);
    return normalizeDebt(payload);
  });
}

export function useCreateDebtPayment() {
  return useDomainMutation('debt', async (payment: CreateDebtPaymentPayload) => {
    const payload = await apiPost<DebtPayment>('/api/debts/payments', payment);
    return normalizeDebtPayment(payload);
  });
}

export type DeleteDebtMode = 'preservePayments' | 'deletePayments';

type DeleteDebtInput = {
  id: number;
  mode?: DeleteDebtMode;
};

export function useDeleteDebt() {
  return useDomainMutation('debt', async ({ id, mode = 'preservePayments' }: DeleteDebtInput) => {
    await api.delete(`/api/debts/${id}`, {
      params: mode === 'deletePayments' ? { cascade: true } : undefined,
    });
  });
}

export function useUnarchiveDebt() {
  return useDomainMutation('debt', async (id: number) => {
    await api.post(`/api/debts/${id}/unarchive`);
  });
}

export function useDeleteDebtPayment() {
  return useDomainMutation('debt', async (id: number) => {
    await api.delete(`/api/debts/payments/${id}`);
  });
}

export function useUpdateDebt() {
  return useDomainMutation('debt', async ({ id, ...debt }: UpdateDebtPayload) => {
    const payload = await apiPatch<Debt>(`/api/debts/${id}`, debt);
    return normalizeDebt(payload);
  });
}
