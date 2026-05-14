import type { SavingsAccount } from '@quro/shared';
import { ArchivedItemsSection } from '@/components/ui';
import {
  useDeleteSavingsAccount,
  useSavingsAccountsQuery,
  useUnarchiveSavingsAccount,
} from '../hooks';

export function SavingsArchivedSection() {
  const accountsQuery = useSavingsAccountsQuery(true);
  const unarchive = useUnarchiveSavingsAccount();
  const deleteAccount = useDeleteSavingsAccount();
  const archived = (accountsQuery.data ?? []).filter(
    (account: SavingsAccount) => account.archivedAt != null,
  );

  return (
    <ArchivedItemsSection
      title="Archived savings accounts"
      entityLabel="Account"
      childrenLabel="transactions"
      items={archived}
      renderMeta={(account) => account.bank}
      getBalance={(account) => ({
        value: account.balance,
        currency: account.currency,
      })}
      onUnarchive={(account) => unarchive.mutate(account.id)}
      onHardDelete={(account) =>
        deleteAccount.mutate({ id: account.id, mode: 'deleteTransactions' })
      }
    />
  );
}
