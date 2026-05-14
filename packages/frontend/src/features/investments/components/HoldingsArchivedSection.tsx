import type { HoldingTransaction } from '@quro/shared';
import { ArchivedItemsSection } from '@/components/ui';
import { useArchivedHoldings, useDeleteHolding, useUnarchiveHolding } from '../hooks';
import { computePosition } from '../utils/position';

type HoldingsArchivedSectionProps = {
  holdingTxns: HoldingTransaction[];
};

export function HoldingsArchivedSection({ holdingTxns }: Readonly<HoldingsArchivedSectionProps>) {
  const archivedQuery = useArchivedHoldings();
  const unarchive = useUnarchiveHolding();
  const deleteHolding = useDeleteHolding();
  const archived = archivedQuery.data ?? [];

  return (
    <ArchivedItemsSection
      title="Archived holdings"
      entityLabel="Holding"
      childrenLabel="buy and sell history"
      items={archived}
      renderMeta={(holding) => holding.ticker.toUpperCase()}
      getBalance={(holding) => {
        const position = computePosition(holding.id, holdingTxns);
        return {
          value: position.shares * holding.currentPrice,
          currency: holding.currency,
          label: 'value',
        };
      }}
      onUnarchive={(holding) => unarchive.mutate(holding.id)}
      onHardDelete={(holding) =>
        deleteHolding.mutate({ id: holding.id, mode: 'deleteTransactions' })
      }
    />
  );
}
