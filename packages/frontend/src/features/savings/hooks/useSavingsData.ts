import { useCreateSavingsAccount } from './useCreateSavingsAccount';
import { useCreateSavingsTransaction } from './useCreateSavingsTransaction';
import { useDeleteSavingsAccount } from './useDeleteSavingsAccount';
import { useDeleteSavingsTransaction } from './useDeleteSavingsTransaction';
import { useSavingsAccounts } from './useSavingsAccounts';
import { useSavingsTransactions } from './useSavingsTransactions';
import { useUpdateSavingsAccount } from './useUpdateSavingsAccount';
import { useUpdateSavingsTransaction } from './useUpdateSavingsTransaction';

export function useSavingsData() {
  const { data: accounts = [], isLoading: loadingAccounts } = useSavingsAccounts();
  const { data: transactions = [], isLoading: loadingTxns } = useSavingsTransactions();
  const createAccount = useCreateSavingsAccount();
  const updateAccount = useUpdateSavingsAccount();
  const deleteAccount = useDeleteSavingsAccount();
  const createTxn = useCreateSavingsTransaction();
  const updateTxn = useUpdateSavingsTransaction();
  const deleteTxn = useDeleteSavingsTransaction();

  return {
    accounts,
    transactions,
    loadingAccounts,
    loadingTxns,
    createAccount,
    updateAccount,
    deleteAccount,
    createTxn,
    updateTxn,
    deleteTxn,
  };
}
