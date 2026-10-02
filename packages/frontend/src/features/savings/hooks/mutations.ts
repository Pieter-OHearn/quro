import { useDomainMutation } from '@/lib/useDomainMutation';
import { apiPost, api, apiPatch } from '@/lib/api';
import type { SavingsAccount, SavingsTransaction } from '@quro/shared';
import type { DeleteSavingsAccountMode } from '../types';

export function useCreateSavingsAccount() {
  return useDomainMutation('savings', async (account: Omit<SavingsAccount, 'id'>) => {
    return apiPost<SavingsAccount>('/api/savings/accounts', account);
  });
}

export function useCreateSavingsTransaction() {
  return useDomainMutation('savings', async (transaction: Omit<SavingsTransaction, 'id'>) => {
    return apiPost<SavingsTransaction>('/api/savings/transactions', transaction);
  });
}

type DeleteSavingsAccountInput = {
  id: number;
  mode: DeleteSavingsAccountMode;
};

export function useDeleteSavingsAccount() {
  return useDomainMutation('savings', async ({ id, mode }: DeleteSavingsAccountInput) => {
    await api.delete(`/api/savings/accounts/${id}`, {
      params: mode === 'deleteTransactions' ? { cascade: true } : undefined,
    });
  });
}

export function useUnarchiveSavingsAccount() {
  return useDomainMutation('savings', async (id: number) => {
    await api.post(`/api/savings/accounts/${id}/unarchive`);
  });
}

export function useDeleteSavingsTransaction() {
  return useDomainMutation('savings', async (id: number) => {
    await api.delete(`/api/savings/transactions/${id}`);
  });
}

export function useUpdateSavingsAccount() {
  return useDomainMutation('savings', async ({ id, ...account }: SavingsAccount) => {
    return apiPatch<SavingsAccount>(`/api/savings/accounts/${id}`, account);
  });
}

export function useUpdateSavingsTransaction() {
  return useDomainMutation('savings', async ({ id, ...transaction }: SavingsTransaction) => {
    return apiPatch<SavingsTransaction>(`/api/savings/transactions/${id}`, transaction);
  });
}
