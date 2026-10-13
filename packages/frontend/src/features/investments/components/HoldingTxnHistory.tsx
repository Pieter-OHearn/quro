import { HOLDING_TXN_META as TXN_META } from '../constants';
import { useState } from 'react';
import { useCurrency } from '@/lib/CurrencyContext';
import { Change, TxnHistoryPanel, TxnRow } from '@/components/ui';
import { TxnAmount } from '@/components/finance/TxnAmount';
import { useUnitPriceFormatter, type UnitPriceFormatFn } from '../hooks/useUnitPriceFormatter';
import { holdingValue, type Holding, type HoldingTransaction } from '@quro/shared';
import { getIncomeTxnLabels } from '../utils/incomeTxnLabels';
import type { HoldingTxnType, Position } from '../utils/position';

type HoldingTxnHistoryProps = {
  holding: Holding;
  position: Position;
  transactions: HoldingTransaction[];
  onAdd: () => void;
  onEdit: (transaction: HoldingTransaction) => void;
  onDelete: (id: number) => void;
};

type FmtNativeFn = (value: number, currency: string, compact?: boolean) => string;

/** Buys move money out, sells and income move money in. */
function signedHoldingCashflow(transaction: HoldingTransaction): number {
  if (transaction.type === 'buy') return -holdingValue(transaction.shares ?? 0, transaction.price);
  if (transaction.type === 'sell') return holdingValue(transaction.shares ?? 0, transaction.price);
  return transaction.price;
}

function buildHoldingStats(
  position: Position,
  holding: Holding,
  totalIncomeLabel: string,
  fmtNative: FmtNativeFn,
  fmtPrice: UnitPriceFormatFn,
) {
  return [
    { label: 'Avg cost', value: fmtPrice(position.avgCost, holding.currency) },
    {
      label: totalIncomeLabel,
      value: (
        <TxnAmount
          value={position.totalDividends}
          format={(amount) => fmtNative(amount, holding.currency, true)}
        />
      ),
    },
    {
      label: 'Realized gain',
      value: (
        <Change
          value={position.realizedGain}
          format="amount"
          currency={holding.currency}
          showArrow={false}
          className="text-figure-md"
        />
      ),
    },
  ];
}

export function HoldingTxnHistory({
  holding,
  position,
  transactions,
  onAdd,
  onEdit,
  onDelete,
}: HoldingTxnHistoryProps) {
  const { fmtNative } = useCurrency();
  const fmtPrice = useUnitPriceFormatter();
  const [filter, setFilter] = useState<HoldingTxnType | 'all'>('all');
  const incomeLabels = getIncomeTxnLabels(holding);
  const txnMeta = {
    ...TXN_META,
    dividend: { ...TXN_META.dividend, label: incomeLabels.singular },
  };
  const filterOptions = [
    { key: 'all', label: 'All' },
    { key: 'buy', label: 'Buys' },
    { key: 'sell', label: 'Sells' },
    { key: 'dividend', label: incomeLabels.plural },
  ];

  const sorted = [...transactions]
    .filter(
      (transaction) =>
        transaction.holdingId === holding.id &&
        (transaction.type as string) in txnMeta &&
        (filter === 'all' || transaction.type === filter),
    )
    .sort((a, b) => b.date.localeCompare(a.date));

  const stats = buildHoldingStats(
    position,
    holding,
    `Total ${incomeLabels.plural.toLowerCase()}`,
    fmtNative,
    fmtPrice,
  );

  return (
    <TxnHistoryPanel
      filterOptions={filterOptions}
      filter={filter}
      onFilterChange={(key) => setFilter(key as HoldingTxnType | 'all')}
      stats={stats}
      statsColumns={3}
      onAdd={onAdd}
      addLabel="Add transaction"
      isEmpty={sorted.length === 0}
    >
      {sorted.map((transaction) => {
        const meta = txnMeta[transaction.type as HoldingTxnType];
        const isTrade = transaction.type === 'buy' || transaction.type === 'sell';
        const trade = isTrade
          ? ` · ${transaction.shares ?? 0} @ ${fmtPrice(transaction.price, holding.currency)}`
          : '';
        return (
          <TxnRow
            key={transaction.id}
            icon={meta.icon}
            iconColor={meta.color}
            label={`${transaction.note || meta.label}${trade}`}
            date={transaction.date}
            badge={transaction.note ? { text: meta.label, className: 'max-sm:hidden' } : undefined}
            amount={
              <TxnAmount
                value={signedHoldingCashflow(transaction)}
                format={(amount) => fmtNative(amount, holding.currency, true)}
              />
            }
            onEdit={() => onEdit(transaction)}
            onDelete={() => onDelete(transaction.id)}
          />
        );
      })}
    </TxnHistoryPanel>
  );
}
