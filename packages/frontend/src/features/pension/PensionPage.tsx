import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import {
  PensionGrowthChart,
  PensionHeroBanner,
  PensionModals,
  PensionPotsList,
  PensionRetirementProjection,
  PensionSummaryStats,
} from './components';
import { usePensionPageState } from './hooks';

export function Pension(): JSX.Element {
  const state = usePensionPageState();

  if (state.isLoading) return <LoadingSpinner />;

  return (
    <div className="p-6 space-y-6">
      <PensionModals state={state} />
      <PensionHeroBanner
        pensions={state.pensions}
        totalInBase={state.totalInBase}
        projected={state.projected}
        yearsToRetirement={state.yearsToRetirement}
        fmtBase={state.fmtBase}
        baseCurrency={state.baseCurrency}
      />
      <PensionSummaryStats
        totalInBase={state.totalInBase}
        totalMonthlyContribInBase={state.totalMonthlyContribInBase}
        monthlyDrawdown={state.monthlyDrawdown}
        pensionsCount={state.pensions.length}
        fmtBase={state.fmtBase}
      />
      <PensionGrowthChart
        pensionGrowthData={state.pensionGrowthData}
        pensionGrowthPct={state.pensionGrowthPct}
        fmtBase={state.fmtBase}
        baseCurrency={state.baseCurrency}
      />
      <PensionPotsList
        pensions={state.pensions}
        pensionTxns={state.pensionTxns}
        expanded={state.expanded}
        setExpanded={state.setExpanded}
        setEditing={state.setEditing}
        setShowModal={state.setShowModal}
        setAddTxnForPot={state.setAddTxnForPot}
        setEditingTxn={state.setEditingTxn}
        deletePot={state.deletePot}
        handleDeletePensionTxn={state.handleDeletePensionTxn}
        fmtBase={state.fmtBase}
        fmtNative={state.fmtNative}
        convertToBase={state.convertToBase}
        isForeign={state.isForeign}
        baseCurrency={state.baseCurrency}
      />
      <PensionRetirementProjection
        totalInBase={state.totalInBase}
        projected={state.projected}
        monthlyDrawdown={state.monthlyDrawdown}
        yearsToRetirement={state.yearsToRetirement}
        retirementYearsInput={state.retirementYearsInput}
        onRetirementYearsChange={state.setRetirementYearsInput}
        fmtBase={state.fmtBase}
        baseCurrency={state.baseCurrency}
      />
    </div>
  );
}
