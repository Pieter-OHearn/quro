import { ArchivedItemsSection } from '@/components/ui';
import { useArchivedMortgages, useDeleteMortgage, useUnarchiveMortgage } from '../hooks';

export function MortgageArchivedSection() {
  const archivedQuery = useArchivedMortgages();
  const unarchive = useUnarchiveMortgage();
  const deleteMortgage = useDeleteMortgage();
  const archived = (archivedQuery.data ?? []).map((mortgage) => ({
    ...mortgage,
    name: mortgage.propertyAddress,
  }));

  return (
    <ArchivedItemsSection
      title="Archived mortgages"
      entityLabel="Mortgage"
      childrenLabel="repayment history"
      items={archived}
      renderMeta={(mortgage) => mortgage.lender}
      getBalance={(mortgage) => ({
        value: mortgage.outstandingBalance,
        currency: mortgage.currency,
        label: 'outstanding balance',
      })}
      onUnarchive={(mortgage) => unarchive.mutate(mortgage.id)}
      onHardDelete={(mortgage) =>
        deleteMortgage.mutate({ id: mortgage.id, mode: 'deleteTransactions' })
      }
    />
  );
}
