import { useMemo } from 'react';
import { LoadingSpinner } from '@/components/ui';
import { useCurrency } from '@/lib/CurrencyContext';
import type {
  Holding,
  HoldingPriceSyncResult,
  HoldingTransaction,
  Mortgage,
  Property,
  PropertyTransaction,
} from '@quro/shared';
import {
  InvestmentModals,
  InvestmentStatCards,
  InvestmentTabPanel,
  PortfolioChart,
  TabSwitcher,
} from './components';
import {
  useInvestmentActions,
  useInvestmentData,
  useInvestmentPortfolioStats,
  useInvestmentPositions,
  useInvestmentUIState,
  usePortfolioHistory,
  useSyncHoldingPrices,
} from './hooks';
import type {
  ConvertToBaseFn,
  InvestmentActions,
  InvestmentFormatFn,
  InvestmentNativeFormatFn,
  InvestmentPortfolioStats,
  InvestmentUIState,
  IsForeignFn,
  PortfolioHistoryPoint,
} from './types';
import type { Position } from './utils/position';
import { buildHoldingModalsProps, buildPropertyModalsProps } from './utils/modal-props';

type InvestmentPageBodyProps = {
  holdings: Holding[];
  holdingTxns: HoldingTransaction[];
  properties: Property[];
  propertyTxns: PropertyTransaction[];
  mortgageById: Map<number, Mortgage>;
  positions: Record<number, Position>;
  stats: InvestmentPortfolioStats;
  portfolioHistory: PortfolioHistoryPoint[];
  ui: InvestmentUIState;
  actions: InvestmentActions;
  baseCurrency: string;
  fmtBase: InvestmentFormatFn;
  fmtNative: InvestmentNativeFormatFn;
  convertToBase: ConvertToBaseFn;
  isForeign: IsForeignFn;
  onSyncPrices: () => void;
  isSyncingPrices: boolean;
  syncSummary: HoldingPriceSyncResult | null;
};

function InvestmentPageBody({
  holdings,
  holdingTxns,
  properties,
  propertyTxns,
  mortgageById,
  positions,
  stats,
  portfolioHistory,
  ui,
  actions,
  baseCurrency,
  fmtBase,
  fmtNative,
  convertToBase,
  isForeign,
  onSyncPrices,
  isSyncingPrices,
  syncSummary,
}: Readonly<InvestmentPageBodyProps>) {
  return (
    <div className="p-6 space-y-6">
      <InvestmentModals
        holdingModals={buildHoldingModalsProps(ui, actions, positions)}
        propertyModals={buildPropertyModalsProps(ui, actions, mortgageById)}
      />
      <InvestmentStatCards {...stats} fmtBase={fmtBase} />
      <PortfolioChart data={portfolioHistory} baseCurrency={baseCurrency} fmtBase={fmtBase} />
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <TabSwitcher tab={ui.tab} onSetTab={ui.setTab} />
        <InvestmentTabPanel
          tab={ui.tab}
          holdings={holdings}
          holdingTxns={holdingTxns}
          properties={properties}
          propertyTxns={propertyTxns}
          mortgageById={mortgageById}
          positions={positions}
          stats={stats}
          ui={ui}
          actions={actions}
          baseCurrency={baseCurrency}
          fmtBase={fmtBase}
          fmtNative={fmtNative}
          convertToBase={convertToBase}
          isForeign={isForeign}
          onSyncPrices={onSyncPrices}
          isSyncingPrices={isSyncingPrices}
          syncSummary={syncSummary}
        />
      </div>
    </div>
  );
}

export function Investments() {
  const { fmtBase, convertToBase, isForeign, baseCurrency, fmtNative } = useCurrency();
  const { holdings, holdingTxns, properties, propertyTxns, mortgages, isLoading } =
    useInvestmentData();
  const syncHoldingPrices = useSyncHoldingPrices();
  const ui = useInvestmentUIState();

  const mortgageById = useMemo(
    () => new Map(mortgages.map((mortgage) => [mortgage.id, mortgage])),
    [mortgages],
  );
  const positions = useInvestmentPositions(holdings, holdingTxns);
  const stats = useInvestmentPortfolioStats(
    holdings,
    positions,
    properties,
    propertyTxns,
    mortgageById,
    convertToBase,
  );
  const actions = useInvestmentActions(holdings, properties, ui);
  const portfolioHistory = usePortfolioHistory(
    holdings,
    holdingTxns,
    properties,
    propertyTxns,
    mortgageById,
    convertToBase,
  );

  if (isLoading) return <LoadingSpinner />;

  return (
    <InvestmentPageBody
      holdings={holdings}
      holdingTxns={holdingTxns}
      properties={properties}
      propertyTxns={propertyTxns}
      mortgageById={mortgageById}
      positions={positions}
      stats={stats}
      portfolioHistory={portfolioHistory}
      ui={ui}
      actions={actions}
      baseCurrency={baseCurrency}
      fmtBase={fmtBase}
      fmtNative={fmtNative}
      convertToBase={convertToBase}
      isForeign={isForeign}
      onSyncPrices={() => syncHoldingPrices.mutate()}
      isSyncingPrices={syncHoldingPrices.isPending}
      syncSummary={syncHoldingPrices.data ?? null}
    />
  );
}
