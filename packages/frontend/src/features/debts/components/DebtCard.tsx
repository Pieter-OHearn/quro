import { useState } from 'react';
import { formatPercent, type Debt, type DebtPayment } from '@quro/shared';
import {
  AlertTriangle,
  Calendar,
  Check,
  ChevronDown,
  ChevronUp,
  Edit3,
  Percent,
  Target,
  Trash2,
  X,
} from 'lucide-react';
import { Badge, Card, IconButton } from '@/components/ui';
import { useCurrency } from '@/lib/CurrencyContext';
import { DEBT_TYPE_META } from '../constants';
import {
  calculateDebtPaidAmount,
  calculateDebtPaidPercentage,
  estimateDebtRemainingInterest,
  formatDebtPayoffLabel,
} from '../utils/debt-metrics';
import { PaymentHistory } from './PaymentHistory';

type DebtCardProps = {
  debt: Debt;
  payments: readonly DebtPayment[];
  expanded: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onLogPayment: () => void;
  onDeletePayment: (id: number) => void;
};

type DebtCardHeaderProps = Pick<DebtCardProps, 'debt' | 'onEdit' | 'onDelete'>;

function DebtCardHeader({ debt, onEdit, onDelete }: Readonly<DebtCardHeaderProps>) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const typeMeta = DEBT_TYPE_META[debt.type];
  const TypeIcon = typeMeta.icon;

  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        <div
          className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl text-xl"
          style={{ backgroundColor: `${debt.color}1a` }}
        >
          {debt.emoji}
        </div>
        <div className="min-w-0">
          <p className="truncate font-semibold text-fg">{debt.name}</p>
          <div className="mt-0.5 flex flex-wrap items-center gap-2">
            <Badge size="xs" className={`border ${typeMeta.toneClassName}`}>
              <TypeIcon size={8} />
              {typeMeta.label}
            </Badge>
            <span className="truncate text-[10px] text-fg-faint">{debt.lender}</span>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-1">
        <IconButton icon={Edit3} label="Edit debt" variant="subtle" size="md" onClick={onEdit} />
        {confirmDelete ? (
          <>
            <IconButton
              icon={Check}
              label="Confirm delete debt"
              variant="subtle"
              size="md"
              className="bg-danger text-fg-inverted hover:bg-danger-hover hover:text-fg-inverted"
              onClick={() => {
                onDelete();
                setConfirmDelete(false);
              }}
            />
            <IconButton
              icon={X}
              label="Cancel delete debt"
              variant="subtle"
              size="md"
              onClick={() => setConfirmDelete(false)}
            />
          </>
        ) : (
          <IconButton
            icon={Trash2}
            label="Delete debt"
            variant="subtle"
            size="md"
            onClick={() => setConfirmDelete(true)}
          />
        )}
      </div>
    </div>
  );
}

function DebtBalanceSummary({ debt }: Readonly<{ debt: Debt }>) {
  const { fmtBase, fmtNative, isForeign } = useCurrency();

  return (
    <div className="mb-3 flex items-end justify-between">
      <div>
        <p className="mb-0.5 text-[10px] uppercase tracking-wide text-fg-faint">Remaining</p>
        <p className="text-xl font-bold text-fg">
          {fmtNative(debt.remainingBalance, debt.currency)}
        </p>
        {isForeign(debt.currency) ? (
          <p className="text-[11px] text-fg-faint">
            ≈ {fmtBase(debt.remainingBalance, debt.currency)}
          </p>
        ) : null}
      </div>
      <div className="text-right">
        <p className="mb-0.5 text-[10px] uppercase tracking-wide text-fg-faint">Original</p>
        <p className="text-sm text-fg-subtle">{fmtNative(debt.originalAmount, debt.currency)}</p>
      </div>
    </div>
  );
}

function DebtProgress({ debt }: Readonly<{ debt: Debt }>) {
  const { fmtNative } = useCurrency();
  const paidAmount = calculateDebtPaidAmount(debt);
  const paidPercentage = calculateDebtPaidPercentage(debt);

  return (
    <div className="mb-4">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-[10px] text-fg-faint">
          {formatPercent(paidPercentage, 0)} paid off
        </span>
        <span className="text-[10px] text-fg-faint">
          {fmtNative(paidAmount, debt.currency)} repaid
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-surface-muted">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${paidPercentage}%`, backgroundColor: debt.color }}
        />
      </div>
    </div>
  );
}

function DebtMetricGrid({ debt, highInterest }: Readonly<{ debt: Debt; highInterest: boolean }>) {
  const { fmtNative } = useCurrency();
  const payoffLabel = formatDebtPayoffLabel(debt);

  return (
    <div className="mb-4 grid grid-cols-3 gap-2">
      {[
        {
          label: 'APR',
          value: formatPercent(debt.interestRate, 2),
          icon: Percent,
          className: highInterest
            ? 'bg-danger-soft border-danger-soft-strong text-danger-hover'
            : 'bg-surface-sunken border-border-subtle text-fg-strong',
          iconClassName: highInterest ? 'text-danger-muted' : 'text-fg-faint',
        },
        {
          label: 'Monthly',
          value: fmtNative(debt.monthlyPayment, debt.currency),
          icon: Calendar,
          className: 'bg-surface-sunken border-border-subtle text-fg-strong',
          iconClassName: 'text-fg-faint',
        },
        {
          label: 'Payoff',
          value: payoffLabel,
          icon: Target,
          className: 'bg-surface-sunken border-border-subtle text-fg-strong',
          iconClassName: 'text-fg-faint',
        },
      ].map((item) => {
        const Icon = item.icon;

        return (
          <div
            key={item.label}
            className={`rounded-xl border px-3 py-2 text-center ${item.className}`}
          >
            <Icon size={11} className={`mx-auto mb-0.5 ${item.iconClassName}`} />
            <p className="text-[11px] font-semibold">{item.value}</p>
            <p className="text-[9px] uppercase tracking-wide text-fg-faint">{item.label}</p>
          </div>
        );
      })}
    </div>
  );
}

function HighInterestNotice({ debt }: Readonly<{ debt: Debt }>) {
  const { fmtNative } = useCurrency();
  const remainingInterest = estimateDebtRemainingInterest(debt);

  if (remainingInterest == null) return null;

  return (
    <div className="mb-3 flex items-start gap-2 rounded-xl border border-danger-soft-strong bg-danger-soft px-3 py-2">
      <AlertTriangle size={12} className="mt-0.5 flex-shrink-0 text-danger" />
      <p className="text-[11px] text-danger-fg">
        High interest. Estimated remaining interest is{' '}
        <span className="font-semibold">{fmtNative(remainingInterest, debt.currency, true)}</span>.
      </p>
    </div>
  );
}

function HistoryToggle({
  expanded,
  paymentCount,
  onToggle,
}: Readonly<{ expanded: boolean; paymentCount: number; onToggle: () => void }>) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex w-full items-center justify-center gap-1.5 py-1 text-xs text-fg-faint transition-colors hover:text-fg-strong"
    >
      {expanded ? (
        <>
          <ChevronUp size={13} />
          Hide history
        </>
      ) : (
        <>
          <ChevronDown size={13} />
          Payment history ({paymentCount})
        </>
      )}
    </button>
  );
}

export function DebtCard({
  debt,
  payments,
  expanded,
  onToggle,
  onEdit,
  onDelete,
  onLogPayment,
  onDeletePayment,
}: Readonly<DebtCardProps>) {
  const highInterest = debt.interestRate >= 10;

  return (
    <Card
      padding="none"
      className={`overflow-hidden border transition-all duration-200 ${
        expanded
          ? 'border-border-strong shadow-lg'
          : 'border-border-subtle shadow-sm hover:shadow-md'
      }`}
    >
      <div className="h-1 w-full" style={{ backgroundColor: debt.color }} />
      <div className="p-5">
        <DebtCardHeader debt={debt} onEdit={onEdit} onDelete={onDelete} />
        <DebtBalanceSummary debt={debt} />
        <DebtProgress debt={debt} />
        <DebtMetricGrid debt={debt} highInterest={highInterest} />
        {highInterest ? <HighInterestNotice debt={debt} /> : null}
        <HistoryToggle expanded={expanded} paymentCount={payments.length} onToggle={onToggle} />
      </div>

      {expanded ? (
        <div className="px-5 pb-5">
          <PaymentHistory
            debt={debt}
            payments={payments}
            onLogPayment={onLogPayment}
            onDeletePayment={onDeletePayment}
          />
        </div>
      ) : null}
    </Card>
  );
}
