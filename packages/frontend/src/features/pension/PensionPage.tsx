import { useEffect } from 'react';
import { useSearchParams } from 'react-router';
import type { PensionPot } from '@quro/shared';
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

type DeepLinkResolution =
  | { type: 'none' }
  | { type: 'clear' }
  | { type: 'open'; importId: number; pot: PensionPot };

function clearImportParams(
  searchParams: URLSearchParams,
  setSearchParams: ReturnType<typeof useSearchParams>[1],
): void {
  const next = new URLSearchParams(searchParams);
  next.delete('importId');
  next.delete('potId');
  setSearchParams(next, { replace: true });
}

function resolveDeepLink(
  searchParams: URLSearchParams,
  pensions: PensionPot[],
): DeepLinkResolution {
  const importIdRaw = searchParams.get('importId');
  const potIdRaw = searchParams.get('potId');
  if (!importIdRaw && !potIdRaw) return { type: 'none' };

  const importId = Number.parseInt(importIdRaw ?? '', 10);
  const potId = Number.parseInt(potIdRaw ?? '', 10);
  if (!Number.isInteger(importId) || importId <= 0 || !Number.isInteger(potId) || potId <= 0) {
    return { type: 'clear' };
  }

  const pot = pensions.find((candidate) => candidate.id === potId);
  if (!pot) return { type: 'clear' };
  return { type: 'open', importId, pot };
}

export function Pension(): JSX.Element {
  const state = usePensionPageState();
  const [searchParams, setSearchParams] = useSearchParams();
  const { pensions, openImportModal } = state;

  useEffect(() => {
    if (state.isLoading) return;
    const resolution = resolveDeepLink(searchParams, pensions);
    if (resolution.type === 'none') return;
    if (resolution.type === 'clear') {
      clearImportParams(searchParams, setSearchParams);
      return;
    }

    openImportModal(resolution.pot, resolution.importId);
    clearImportParams(searchParams, setSearchParams);
  }, [openImportModal, pensions, searchParams, setSearchParams, state.isLoading]);

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
        openImportModal={state.openImportModal}
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
