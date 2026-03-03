import { Home } from 'lucide-react';
import type { Mortgage as MortgageType } from '@quro/shared';
import { EmptyState, LoadingSpinner } from '@/components/ui';
import {
  AddMortgageModal,
  MortgageCharts,
  MortgageHeroCard,
  MortgageModals,
  MortgageRepaymentProgress,
  MortgageStatCards,
  MortgageTabSelector,
  MortgageTips,
  MortgageTxnHistory,
} from './components';
import { useMortgagePageState } from './hooks/useMortgagePageState';
import type { MortgagePageState } from './types';
import { computeMortgageMetrics } from './utils/mortgage-metrics';

type MortgageEmptyStateProps = {
  state: MortgagePageState;
};

function MortgageEmptyState({ state }: Readonly<MortgageEmptyStateProps>) {
  return (
    <div className="p-6">
      {state.showMortgageModal && (
        <AddMortgageModal
          properties={state.properties}
          linkedPropertyId={null}
          onClose={state.closeMortgageModal}
          onSave={state.handleSaveMortgage}
        />
      )}
      <div className="min-h-[70vh] flex items-center justify-center">
        <EmptyState
          icon={Home}
          title="No mortgages yet"
          description="Add a property first, then create a mortgage linked to that property."
          action={{
            label: state.properties.length === 0 ? 'Add Property First' : 'Set Up Mortgage',
            onClick: () => state.setShowMortgageModal(true),
          }}
        />
      </div>
    </div>
  );
}

type MortgageContentProps = {
  state: MortgagePageState;
  mortgage: MortgageType;
};

function MortgageContent({ state, mortgage }: Readonly<MortgageContentProps>) {
  const {
    ltv,
    equity,
    paid,
    paidPct,
    monthsRemaining,
    yearsRemaining,
    amortization,
    paymentBreakdown,
    overpaymentImpact,
  } = computeMortgageMetrics(mortgage, state.txns);

  return (
    <div className="p-6 space-y-6">
      <MortgageModals
        showTxnModal={state.showTxnModal}
        showMortgageModal={state.showMortgageModal}
        mortgage={mortgage}
        editingMortgage={state.editingMortgage}
        properties={state.properties}
        editingLinkedPropertyId={state.editingLinkedPropertyId}
        onCloseTxnModal={() => state.setShowTxnModal(false)}
        onCloseMortgageModal={state.closeMortgageModal}
        onSaveTxn={state.handleAddTxn}
        onSaveMortgage={state.handleSaveMortgage}
      />
      <MortgageTabSelector
        mortgages={state.mortgages}
        activeMortgage={mortgage}
        onSelect={state.setActiveMortgageId}
        onAddClick={() => {
          state.setEditingMortgage(null);
          state.setShowMortgageModal(true);
        }}
      />
      <MortgageHeroCard
        mortgage={mortgage}
        fmt={state.fmt}
        yearsRemaining={yearsRemaining}
        monthsRemaining={monthsRemaining}
        onEdit={() => {
          state.setEditingMortgage(mortgage);
          state.setShowMortgageModal(true);
        }}
      />
      <MortgageStatCards
        mortgage={mortgage}
        fmt={state.fmt}
        equity={equity}
        ltv={ltv}
        paid={paid}
        paidPct={paidPct}
      />
      <MortgageRepaymentProgress
        mortgage={mortgage}
        fmt={state.fmt}
        paid={paid}
        paidPct={paidPct}
      />
      <MortgageCharts
        fmt={state.fmt}
        amortization={amortization}
        paymentBreakdown={paymentBreakdown}
      />
      <MortgageTxnHistory
        mortgage={mortgage}
        transactions={state.txns}
        onAdd={() => state.setShowTxnModal(true)}
        onDelete={state.handleDeleteTxn}
      />
      <MortgageTips mortgage={mortgage} fmt={state.fmt} overpaymentImpact={overpaymentImpact} />
    </div>
  );
}

export function Mortgage() {
  const state = useMortgagePageState();

  if (state.isLoading) return <LoadingSpinner className="min-h-[256px]" />;
  if (!state.mortgage) return <MortgageEmptyState state={state} />;

  return <MortgageContent state={state} mortgage={state.mortgage} />;
}
