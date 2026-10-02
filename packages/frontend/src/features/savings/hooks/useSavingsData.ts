import {
  useCreateSavingsAccount,
  useCreateSavingsTransaction,
  useDeleteSavingsAccount,
  useDeleteSavingsTransaction,
  useUpdateSavingsAccount,
  useUpdateSavingsTransaction,
} from './mutations';
import { getFailedRouteQueries } from '@/lib/routeQueryErrors';
import { useSavingsAccountsQuery } from './useSavingsAccounts';
import { useSavingsTransactions } from './useSavingsTransactions';

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
