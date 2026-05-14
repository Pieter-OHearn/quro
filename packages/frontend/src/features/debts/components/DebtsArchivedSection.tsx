import { ArchivedItemsSection } from '@/components/ui';
import { useArchivedDebts, useDeleteDebt, useUnarchiveDebt } from '../hooks';

export function DebtsArchivedSection() {
  const archivedQuery = useArchivedDebts();
  const unarchive = useUnarchiveDebt();
  const deleteDebt = useDeleteDebt();
  const archived = archivedQuery.data ?? [];

  return (
    <ArchivedItemsSection
      title="Archived debts"
      entityLabel="Debt"
      childrenLabel="payment history"
      items={archived}
      renderMeta={(debt) => debt.lender}
      getBalance={(debt) => ({
        value: debt.remainingBalance,
        currency: debt.currency,
        label: 'outstanding balance',
      })}
      onUnarchive={(debt) => unarchive.mutate(debt.id)}
      onHardDelete={(debt) => deleteDebt.mutate({ id: debt.id, mode: 'deletePayments' })}
    />
  );
}
