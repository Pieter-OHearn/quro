import { useMemo } from 'react';
import { Home } from 'lucide-react';
import { useNavigate } from 'react-router';
import type { Mortgage as MortgageType, MortgageTransaction, Property } from '@quro/shared';
import { EmptyState, LoadingState, PageStack } from '@/components/ui';
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
    <PageStack>
      {state.showMortgageModal && (
        <AddMortgageModal
          properties={state.properties}
          linkedPropertyId={null}
          onClose={state.closeMortgageModal}
          onSave={state.handleSaveMortgage}
        />
      )}
      <EmptyState
        icon={Home}
        title="No mortgages yet"
        description={
          hasProperties
            ? 'Create a mortgage linked to one of your properties.'
            : 'Add a property first, then create a mortgage linked to that property.'
        }
        action={{
          label: hasProperties ? 'Set up mortgage' : 'Add a property first',
          onClick: hasProperties
            ? () => state.setShowMortgageModal(true)
            : () => navigate('/investments'),
        }}
      />
      <MortgageArchivedSection />
    </PageStack>
  );
}

type MortgageContentProps = {
  state: MortgagePageState;
  mortgage: MortgageType;
};

function useMortgageMetrics(
  mortgage: MortgageType,
  transactions: MortgageTransaction[],
  linkedProperty: Property | undefined,
) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const currentDay = today.getTime();
  return useMemo(
    () => computeMortgageMetrics(mortgage, transactions, linkedProperty, new Date(currentDay)),
    [mortgage, transactions, linkedProperty, currentDay],
  );
}

// The property the mortgage is linked to, and its valuations, which its ledger owns.
function useLinkedProperty(state: MortgagePageState, mortgage: MortgageType) {
  return useMemo(
    () => ({
      linkedProperty: state.properties.find(
        (property) => property.id === mortgage.linkedPropertyId,
      ),
      valuations: state.propertyTxns.filter(
        (txn) => txn.propertyId === mortgage.linkedPropertyId && txn.type === 'valuation',
      ),
    }),
    [state.properties, state.propertyTxns, mortgage.linkedPropertyId],
  );
}

function MortgageContent({ state, mortgage }: Readonly<MortgageContentProps>) {
  const { linkedProperty, valuations } = useLinkedProperty(state, mortgage);
  const metrics = useMortgageMetrics(mortgage, state.txns, linkedProperty);
  const { paid, paidPct } = metrics;

  return (
    <PageStack>
      <MortgageModals
        showTxnModal={state.showTxnModal}
        editingTxn={state.editingTxn}
        showMortgageModal={state.showMortgageModal}
        mortgage={mortgage}
        transactions={state.txns}
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
        yearsRemaining={metrics.yearsRemaining}
        monthsRemaining={metrics.monthsRemaining}
        onEdit={() => {
          state.setEditingMortgage(mortgage);
          state.setShowMortgageModal(true);
        }}
      />
      <MortgageStatCards
        mortgage={mortgage}
        fmt={state.fmt}
        equity={metrics.equity}
        totalEquity={metrics.totalEquity}
        ltv={metrics.ltv}
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
        amortization={metrics.amortization}
        paymentBreakdown={metrics.paymentBreakdown}
        repaymentType={mortgage.repaymentType}
      />
      <MortgageTxnHistory
        mortgage={mortgage}
        transactions={state.txns}
        propertyValuations={valuations}
        onAdd={() => state.setShowTxnModal(true)}
        onEdit={state.setEditingTxn}
        onDelete={state.handleDeleteTxn}
      />
      <MortgageArchivedSection />
    </PageStack>
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
