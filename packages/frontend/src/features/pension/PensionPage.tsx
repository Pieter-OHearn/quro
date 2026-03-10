import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router';
import type { PensionPot } from '@quro/shared';
import { LoadingSpinner } from '@/components/ui';
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

type ParsedDeepLinkIds =
  | { type: 'none' }
  | { type: 'clear' }
  | { type: 'open'; importId: number; potId: number };

function parsePositiveInt(value: unknown): number | null {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

function parseDeepLinkIds(routeState: unknown): ParsedDeepLinkIds {
  if (!routeState || typeof routeState !== 'object') return { type: 'none' };
  const state = routeState as { openImportId?: unknown; openImportPotId?: unknown };
  if (state.openImportId === undefined && state.openImportPotId === undefined) {
    return { type: 'none' };
  }

  const importId = parsePositiveInt(state.openImportId);
  const potId = parsePositiveInt(state.openImportPotId);
  if (importId === null || potId === null) return { type: 'clear' };
  return { type: 'open', importId, potId };
}

function clearImportState(
  pathname: string,
  routeState: unknown,
  navigate: ReturnType<typeof useNavigate>,
): void {
  if (!routeState || typeof routeState !== 'object') {
    void navigate(pathname, { replace: true, state: null });
    return;
  }

  const nextState = { ...(routeState as Record<string, unknown>) };
  delete nextState.openImportId;
  delete nextState.openImportPotId;
  void navigate(pathname, {
    replace: true,
    state: Object.keys(nextState).length > 0 ? nextState : null,
  });
}

function resolveDeepLink(routeState: unknown, pensions: PensionPot[]): DeepLinkResolution {
  const parsed = parseDeepLinkIds(routeState);
  if (parsed.type !== 'open') return parsed;

  const pot = pensions.find((candidate) => candidate.id === parsed.potId);
  if (!pot) return { type: 'clear' };
  return { type: 'open', importId: parsed.importId, pot };
}

function useImportDeepLink(state: ReturnType<typeof usePensionPageState>): void {
  const location = useLocation();
  const navigate = useNavigate();
  const consumedDeepLinkRef = useRef<string | null>(null);
  const { pensions, openImportModal } = state;

  useEffect(() => {
    if (state.isLoading) return;
    const resolution = resolveDeepLink(location.state, pensions);
    if (resolution.type === 'none') {
      consumedDeepLinkRef.current = null;
      return;
    }
    if (resolution.type === 'clear') {
      consumedDeepLinkRef.current = null;
      clearImportState(location.pathname, location.state, navigate);
      return;
    }

    const deepLinkKey = `${resolution.importId}:${resolution.pot.id}`;
    if (consumedDeepLinkRef.current === deepLinkKey) return;
    consumedDeepLinkRef.current = deepLinkKey;

    clearImportState(location.pathname, location.state, navigate);
    openImportModal(resolution.pot, resolution.importId);
  }, [location.pathname, location.state, navigate, openImportModal, pensions, state.isLoading]);
}

export function Pension(): JSX.Element {
  const state = usePensionPageState();
  useImportDeepLink(state);

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
        pensionImportCapability={state.pensionImportCapability}
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
