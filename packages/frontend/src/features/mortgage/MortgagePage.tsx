import { Home } from 'lucide-react';
import { useNavigate } from 'react-router';
import type { Mortgage as MortgageType } from '@quro/shared';
import { EmptyState, LoadingState } from '@/components/ui';
import { RouteQueryErrorState } from '@/components/errors/RouteQueryErrorState';
import {
  AddMortgageModal,
  MortgageArchivedSection,
  MortgageCharts,
  MortgageHeroCard,
  MortgageModals,
  MortgageRepaymentProgress,
  MortgageStatCards,
  MortgageTabSelector,
  MortgageTxnHistory,
} from './components';
import { useMortgagePageState } from './hooks/useMortgagePageState';
import type { MortgagePageState } from './types';
import { computeMortgageMetrics } from './utils/mortgage-metrics';

type MortgageEmptyStateProps = {
  state: MortgagePageState;
};

function MortgageEmptyState({ state }: Readonly<MortgageEmptyStateProps>) {
  const navigate = useNavigate();
  const hasProperties = state.properties.length > 0;

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
      <div className="min-h-[60vh] flex items-center justify-center">
        <EmptyState
          icon={Home}
          title="No mortgages yet"
          description={
            hasProperties
              ? 'Create a mortgage linked to one of your properties.'
              : 'Add a property first, then create a mortgage linked to that property.'
          }
          action={{
            label: hasProperties ? 'Set Up Mortgage' : 'Add Property First',
            onClick: hasProperties
              ? () => state.setShowMortgageModal(true)
              : () => navigate('/investments'),
          }}
        />
      </div>
      <MortgageArchivedSection />
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
  } = computeMortgageMetrics(mortgage, state.txns);

  return (
    <div className="p-6 space-y-6">
      <MortgageModals
        showTxnModal={state.showTxnModal}
        editingTxn={state.editingTxn}
        showMortgageModal={state.showMortgageModal}
        mortgage={mortgage}
        editingMortgage={state.editingMortgage}
        properties={state.properties}
        editingLinkedPropertyId={state.editingLinkedPropertyId}
        onCloseTxnModal={state.closeTxnModal}
        onCloseMortgageModal={state.closeMortgageModal}
        onSaveTxn={state.handleAddTxn}
        onSaveMortgage={state.handleSaveMortgage}
        onDeleteMortgage={state.handleDeleteMortgage}
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
        onEdit={state.setEditingTxn}
        onDelete={state.handleDeleteTxn}
      />
      <MortgageArchivedSection />
    </div>
  );
}

export function Mortgage() {
  const state = useMortgagePageState();

  if (state.isLoading) return <LoadingState compact />;
  if (state.queryFailures.length > 0) {
    return <RouteQueryErrorState routeName="Mortgage" failedQueries={state.queryFailures} />;
  }
  if (!state.mortgage) return <MortgageEmptyState state={state} />;

  return <MortgageContent state={state} mortgage={state.mortgage} />;
}
