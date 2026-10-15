import type { Debt, DebtPayment } from '@quro/shared';
import { Info, Plus } from 'lucide-react';
import { Button, ContentSection } from '@/components/ui';
import type { DebtFilterValue } from '../types';
import { DebtCard } from './DebtCard';
import { DebtsEmptyState } from './DebtsEmptyState';
import { FilterPills } from './FilterPills';
import { SummaryBanner } from './SummaryBanner';

type DebtsPageLayoutProps = {
  debts: readonly Debt[];
  filteredDebts: readonly Debt[];
  paymentsByDebtId: ReadonlyMap<number, readonly DebtPayment[]>;
  filter: DebtFilterValue;
  expandedDebtId: number | null;
  onFilterChange: (value: DebtFilterValue) => void;
  onAddDebt: () => void;
  onToggleDebt: (debtId: number) => void;
  onEditDebt: (debt: Debt) => void;
  onDeleteDebt: (debtId: number) => void;
  onLogPayment: (debt: Debt) => void;
  onDeletePayment: (id: number) => void;
};

function DebtsHeader({ onAddDebt }: Readonly<{ onAddDebt: () => void }>) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h2 className="text-title-section text-fg">Debts & liabilities</h2>
        <p className="text-caption text-fg-subtle">
          Loans, credit cards, overdrafts, and other non-mortgage obligations.
        </p>
      </div>
      <Button onClick={onAddDebt} leadingIcon={<Plus size={14} aria-hidden />}>
        Add debt
      </Button>
    </div>
  );
}

function EmptyFilterResult() {
  return (
    <div className="rounded-lg border border-dashed border-border-control bg-surface p-4 text-cell text-fg-muted max-sm:rounded-xl">
      No debts match this filter.
    </div>
  );
}

function DebtsInfoCallout() {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-border-default bg-surface-sunken p-3 max-sm:rounded-xl">
      <Info size={14} className="mt-0.5 shrink-0 text-fg-faint" aria-hidden />
      <p className="text-caption text-fg-subtle">
        Outstanding debt balances are subtracted from your total assets on the dashboard to
        calculate <span className="font-medium text-fg">net worth</span>. Payoff projections use
        standard amortisation and assume a constant monthly payment.
      </p>
    </div>
  );
}

function DebtCardsGrid({
  debts,
  paymentsByDebtId,
  expandedDebtId,
  onToggleDebt,
  onEditDebt,
  onDeleteDebt,
  onLogPayment,
  onDeletePayment,
}: Readonly<Omit<DebtsPageLayoutProps, 'filter' | 'onFilterChange' | 'onAddDebt'>>) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {debts.map((debt) => (
        <DebtCard
          key={debt.id}
          debt={debt}
          payments={paymentsByDebtId.get(debt.id) ?? []}
          expanded={expandedDebtId === debt.id}
          onToggle={() => onToggleDebt(debt.id)}
          onEdit={() => onEditDebt(debt)}
          onDelete={() => onDeleteDebt(debt.id)}
          onLogPayment={() => onLogPayment(debt)}
          onDeletePayment={onDeletePayment}
        />
      ))}
    </div>
  );
}

function DebtsBody(props: Readonly<DebtsPageLayoutProps>) {
  if (props.debts.length === 0) return <DebtsEmptyState onAdd={props.onAddDebt} />;
  if (props.filteredDebts.length === 0) return <EmptyFilterResult />;
  return <DebtCardsGrid {...props} debts={props.filteredDebts} />;
}

export function DebtsPageLayout(props: Readonly<DebtsPageLayoutProps>) {
  const hasDebts = props.debts.length > 0;

  return (
    <>
      {hasDebts ? (
        <ContentSection>
          <SummaryBanner debts={props.debts} />
        </ContentSection>
      ) : null}

      <ContentSection spacing="md">
        <DebtsHeader onAddDebt={props.onAddDebt} />
        {hasDebts ? (
          <FilterPills debts={props.debts} value={props.filter} onChange={props.onFilterChange} />
        ) : null}
        <DebtsBody {...props} />
        {hasDebts ? <DebtsInfoCallout /> : null}
      </ContentSection>
    </>
  );
}
