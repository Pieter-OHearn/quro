import { useState } from 'react';
import { useCurrency } from '@/lib/CurrencyContext';
import { TxnHistoryPanel, TxnRow } from '@/components/ui';
import type { SavingsAccount, SavingsTransaction } from '@quro/shared';
import { TXN_META, FILTER_OPTIONS } from '../constants';
import type { TxnType } from '../constants';

type TxnHistoryProps = {
  account: SavingsAccount;
  transactions: SavingsTransaction[];
  onAdd: () => void;
  onDelete: (id: number) => void;
};

export function TxnHistory({ account, transactions, onAdd, onDelete }: TxnHistoryProps) {
  const { fmtNative } = useCurrency();
  const [filter, setFilter] = useState<TxnType | 'all'>('all');

  const sorted = [...transactions]
    .filter((t) => t.accountId === account.id && (filter === 'all' || t.type === filter))
    .sort((a, b) => b.date.localeCompare(a.date));

  return (
    <TxnHistoryPanel
      filterOptions={FILTER_OPTIONS}
      filter={filter}
      onFilterChange={(key) => setFilter(key as TxnType | 'all')}
      onAdd={onAdd}
      isEmpty={sorted.length === 0}
    >
      {sorted.map((t) => {
        const m = TXN_META[t.type as TxnType];
        return (
          <TxnRow
            key={t.id}
            icon={m.icon}
            iconColor={m.color}
            iconBg={m.bg}
            label={t.note || m.label}
            date={t.date}
            amount={
              <div className="text-right flex-shrink-0">
                <p className={`text-sm font-semibold ${m.color}`}>
                  {m.sign}
                  {fmtNative(t.amount, account.currency, true)}
                </p>
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded-full ${m.bg} ${m.color} capitalize`}
                >
                  {m.label}
                </span>
              </div>
            }
            onDelete={() => onDelete(t.id)}
          />
        );
      })}
    </TxnHistoryPanel>
  );
}
