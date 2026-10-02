import { useDomainMutation } from '@/lib/useDomainMutation';
import { apiPost, api, apiPatch } from '@/lib/api';
import type { Mortgage as MortgageType, MortgageTransaction } from '@quro/shared';
import type { CreateMortgagePayload, UpdateMortgagePayload } from '../types';

export function useCreateMortgage() {
  return useDomainMutation('mortgage', async (mortgage: CreateMortgagePayload) => {
    return apiPost<MortgageType>('/api/mortgages', mortgage);
  });
}

export function useCreateMortgageTransaction() {
  return useDomainMutation('mortgage', async (txn: Omit<MortgageTransaction, 'id'>) => {
    return apiPost<MortgageTransaction>('/api/mortgages/transactions', txn);
  });
}

export type DeleteMortgageMode = 'preserveTransactions' | 'deleteTransactions';

type DeleteMortgageInput = {
  id: number;
  mode?: DeleteMortgageMode;
};

export function useDeleteMortgage() {
  return useDomainMutation(
    'mortgage',
    async ({ id, mode = 'preserveTransactions' }: DeleteMortgageInput) => {
      await api.delete(`/api/mortgages/${id}`, {
        params: mode === 'deleteTransactions' ? { cascade: true } : undefined,
      });
    },
  );
}

export function useUnarchiveMortgage() {
  return useDomainMutation('mortgage', async (id: number) => {
    await api.post(`/api/mortgages/${id}/unarchive`);
  });
}

export function useDeleteMortgageTransaction() {
  return useDomainMutation('mortgage', async (id: number) => {
    await api.delete(`/api/mortgages/transactions/${id}`);
  });
}

export function useUpdateMortgage() {
  return useDomainMutation('mortgage', async ({ id, ...mortgage }: UpdateMortgagePayload) => {
    return apiPatch<MortgageType>(`/api/mortgages/${id}`, mortgage);
  });
}

export function useUpdateMortgageTransaction() {
  return useDomainMutation('mortgage', async ({ id, ...txn }: MortgageTransaction) => {
    return apiPatch<MortgageTransaction>(`/api/mortgages/transactions/${id}`, txn);
  });
}
