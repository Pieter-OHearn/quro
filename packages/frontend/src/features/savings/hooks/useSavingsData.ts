import { useCreateSavingsAccount } from './useCreateSavingsAccount';
import { useCreateSavingsTransaction } from './useCreateSavingsTransaction';
import { useDeleteSavingsAccount } from './useDeleteSavingsAccount';
import { useDeleteSavingsTransaction } from './useDeleteSavingsTransaction';
import { getFailedRouteQueries } from '@/lib/routeQueryErrors';
import { useSavingsAccountsQuery } from './useSavingsAccounts';
import { useSavingsTransactions } from './useSavingsTransactions';
import { useUpdateSavingsAccount } from './useUpdateSavingsAccount';
import { useUpdateSavingsTransaction } from './useUpdateSavingsTransaction';

export function useSavingsData() {
  const accountsQuery = useSavingsAccountsQuery(true);
  const accounts = accountsQuery.data ?? [];
  const activeAccounts = accounts.filter((account) => !account.archivedAt);
  const transactionsQuery = useSavingsTransactions();
  const createAccount = useCreateSavingsAccount();
  const updateAccount = useUpdateSavingsAccount();
  const deleteAccount = useDeleteSavingsAccount();
  const createTxn = useCreateSavingsTransaction();
  const updateTxn = useUpdateSavingsTransaction();
  const deleteTxn = useDeleteSavingsTransaction();

  return {
    accounts: activeAccounts,
    allAccounts: accounts,
    transactions: transactionsQuery.data ?? [],
    loadingAccounts: accountsQuery.isLoading,
    loadingTxns: transactionsQuery.isLoading,
    queryFailures: getFailedRouteQueries([
      { label: 'savings accounts', ...accountsQuery },
      { label: 'savings transactions', ...transactionsQuery },
    ]),
    createAccount,
    updateAccount,
    deleteAccount,
    createTxn,
    updateTxn,
    deleteTxn,
  };
}
