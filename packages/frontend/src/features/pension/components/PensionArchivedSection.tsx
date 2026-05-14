import type { PensionTransaction } from '@quro/shared';
import { ArchivedItemsSection } from '@/components/ui';
import { useArchivedPensionPots, useDeletePensionPot, useUnarchivePensionPot } from '../hooks';
import { computeCurrentPensionBalance } from '../utils/pension-calculations';

type PensionArchivedSectionProps = {
  pensionTxns: PensionTransaction[];
};

export function PensionArchivedSection({ pensionTxns }: Readonly<PensionArchivedSectionProps>) {
  const archivedQuery = useArchivedPensionPots();
  const unarchive = useUnarchivePensionPot();
  const deletePot = useDeletePensionPot();
  const archived = archivedQuery.data ?? [];

  return (
    <ArchivedItemsSection
      title="Archived pension pots"
      entityLabel="Pension pot"
      childrenLabel="contributions and history"
      items={archived}
      renderMeta={(pot) => pot.provider}
      getBalance={(pot) => ({
        value: computeCurrentPensionBalance(
          pot,
          pensionTxns.filter((txn) => txn.potId === pot.id),
        ),
        currency: pot.currency,
      })}
      onUnarchive={(pot) => unarchive.mutate(pot.id)}
      onHardDelete={(pot) => deletePot.mutate({ id: pot.id, mode: 'deleteTransactions' })}
    />
  );
}
