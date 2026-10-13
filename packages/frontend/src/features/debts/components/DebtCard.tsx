import { useState, type CSSProperties } from 'react';
import { formatPercent, type Debt, type DebtPayment } from '@quro/shared';
import { AlertTriangle, Check, ChevronDown, ChevronUp, Edit3, Trash2, X } from 'lucide-react';
import { Badge, Card, IconButton, ProgressMeter } from '@/components/ui';
import { useCurrency } from '@/lib/CurrencyContext';
import { dataColorToken } from '@/lib/dataColors';
import { formatAsNegative } from '@/lib/liability';
import { cn } from '@/lib/utils';
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
    <div className="mb-3 flex items-start justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2">
        <span className="shrink-0 text-xl leading-none" aria-hidden>
          {debt.emoji}
        </span>
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-1.5">
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: dataColorToken(debt.color) }}
              aria-hidden
            />
            <p className="truncate text-title-section text-fg">{debt.name}</p>
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-2">
            <Badge size="xs">
              <TypeIcon size={10} aria-hidden />
              {typeMeta.label}
            </Badge>
            <span className="truncate text-caption text-fg-subtle">{debt.lender}</span>
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
              variant="danger"
              size="md"
              className="bg-danger text-fg-inverted hover:bg-danger hover:text-fg-inverted"
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
            variant="danger"
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
    <div className="mb-3 flex items-end justify-between gap-3">
      <div>
        <p className="text-label text-fg-muted">Remaining</p>
        <p className="text-figure-lg font-numeric text-fg">
          {formatAsNegative((value) => fmtNative(value, debt.currency), debt.remainingBalance)}
        </p>
        {isForeign(debt.currency) ? (
          <p className="text-caption text-fg-subtle font-numeric">
            ≈ {formatAsNegative((value) => fmtBase(value, debt.currency), debt.remainingBalance)}
          </p>
        ) : null}
      </div>
      <div className="text-right">
        <p className="text-label text-fg-muted">Original</p>
        <p className="text-figure-md font-numeric text-fg-muted">
          {fmtNative(debt.originalAmount, debt.currency)}
        </p>
      </div>
    </div>
  );
}

function DebtProgress({ debt }: Readonly<{ debt: Debt }>) {
  const { fmtNative, numberFormat } = useCurrency();
  const paidAmount = calculateDebtPaidAmount(debt);
  const paidPercentage = calculateDebtPaidPercentage(debt);
  const meterStyle = { '--debt-color': dataColorToken(debt.color) } as CSSProperties;

  return (
    <div className="mb-3">
      <div className="mb-1 flex items-center justify-between gap-3 text-caption text-fg-subtle font-numeric">
        <span>{formatPercent(paidPercentage, numberFormat, 0)} paid off</span>
        <span>{fmtNative(paidAmount, debt.currency)} repaid</span>
      </div>
      <ProgressMeter
        value={paidPercentage}
        label={`${debt.name} paid off`}
        style={meterStyle}
        indicatorClassName="bg-(--debt-color)"
      />
    </div>
  );
}

function DebtMetricGrid({ debt }: Readonly<{ debt: Debt }>) {
  const { fmtNative, numberFormat } = useCurrency();
  const payoffLabel = formatDebtPayoffLabel(debt);
  const metrics = [
    { label: 'APR', value: formatPercent(debt.interestRate, numberFormat, 2) },
    { label: 'Monthly', value: fmtNative(debt.monthlyPayment, debt.currency) },
    { label: 'Payoff', value: payoffLabel },
  ];

  return (
    <dl className="mb-3 grid grid-cols-3 gap-3 border-t border-border-subtle pt-3">
      {metrics.map((item) => (
        <div key={item.label} className="min-w-0">
          <dt className="text-label text-fg-muted">{item.label}</dt>
          <dd className="truncate text-figure-md font-numeric text-fg">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function HighInterestNotice({ debt }: Readonly<{ debt: Debt }>) {
  const { fmtNative } = useCurrency();
  const remainingInterest = estimateDebtRemainingInterest(debt);

  if (remainingInterest == null) return null;

  return (
    <div className="mb-3 flex items-start gap-2 rounded-md border border-danger bg-danger-soft px-3 py-2">
      <AlertTriangle size={12} className="mt-0.5 shrink-0 text-danger" aria-hidden />
      <p className="text-caption text-danger">
        High interest. Estimated remaining interest is{' '}
        <span className="font-semibold font-numeric">
          {fmtNative(remainingInterest, debt.currency, true)}
        </span>
        .
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
      aria-expanded={expanded}
      className="flex h-8 w-full items-center justify-center gap-1.5 rounded-md text-cell text-fg-muted transition-colors duration-fast hover:bg-surface-muted hover:text-fg active:bg-surface-muted max-sm:h-11 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus-ring"
    >
      {expanded ? (
        <>
          <ChevronUp size={14} aria-hidden />
          Hide history
        </>
      ) : (
        <>
          <ChevronDown size={14} aria-hidden />
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
    <Card padding="none" className={cn('overflow-hidden', expanded && 'border-border-strong')}>
      <div className="p-4">
        <DebtCardHeader debt={debt} onEdit={onEdit} onDelete={onDelete} />
        <DebtBalanceSummary debt={debt} />
        <DebtProgress debt={debt} />
        <DebtMetricGrid debt={debt} />
        {highInterest ? <HighInterestNotice debt={debt} /> : null}
        <HistoryToggle expanded={expanded} paymentCount={payments.length} onToggle={onToggle} />
      </div>

      {expanded ? (
        <div className="px-4 pb-4">
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
