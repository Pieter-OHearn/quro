import { useMemo } from 'react';
import { Card, LoadingSpinner, PageStack } from '@/components/ui';
import { RouteQueryErrorState } from '@/components/errors/RouteQueryErrorState';
import { useCurrency } from '@/lib/CurrencyContext';
import type {
  Holding,
  HoldingPriceSyncResult,
  HoldingTransaction,
  Mortgage,
  MortgageTransaction,
  Property,
  PropertyTransaction,
} from '@quro/shared';
import {
  InvestmentDataNotices,
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
  useInvestmentStatTrends,
  useHoldingPriceHistory,
  useInvestmentUIState,
  usePortfolioHistory,
  useSyncHoldingPrices,
} from './hooks';
import type {
  ConvertToBaseFn,
  InvestmentActions,
  InvestmentFormatFn,
  InvestmentData,
  InvestmentNativeFormatFn,
  InvestmentPortfolioStats,
  InvestmentStatTrends,
  InvestmentUIState,
  IsForeignFn,
  PortfolioHistoryPoint,
} from './types';
import { groupMortgageRepayments, type Position } from './utils/position';
import type { PropertyDebts } from './utils/portfolio';
import { isPriceStale } from './utils/priceFreshness';
import { buildHoldingModalsProps, buildPropertyModalsProps } from './utils/modal-props';

type InvestmentPageBodyProps = {
  activeHoldings: Holding[];
  closedHoldings: Holding[];
  holdingTxns: HoldingTransaction[];
  properties: Property[];
  propertyTxns: PropertyTransaction[];
  mortgageById: Map<number, Mortgage>;
  mortgageTxns: MortgageTransaction[];
  positions: Record<number, Position>;
  stats: InvestmentPortfolioStats;
  statTrends: InvestmentStatTrends;
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
  priceHistoryFailed: boolean;
  onRetryPriceHistory: () => void;
};

function InvestmentPageBody({
  activeHoldings,
  closedHoldings,
  holdingTxns,
  properties,
  propertyTxns,
  mortgageById,
  mortgageTxns,
  positions,
  stats,
  statTrends,
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
  priceHistoryFailed,
  onRetryPriceHistory,
}: Readonly<InvestmentPageBodyProps>) {
  const staleHoldings = useMemo(
    () => activeHoldings.filter((holding) => isPriceStale(holding)),
    [activeHoldings],
  );
  return (
    <PageStack>
      <InvestmentModals
        holdingModals={buildHoldingModalsProps(
          ui,
          actions,
          [...activeHoldings, ...closedHoldings],
          holdingTxns,
          positions,
        )}
        propertyModals={buildPropertyModalsProps(ui, actions, properties, propertyTxns)}
      />
      <InvestmentDataNotices
        staleHoldings={staleHoldings}
        historyLoadFailed={priceHistoryFailed}
        onRetryHistory={onRetryPriceHistory}
        onSyncPrices={onSyncPrices}
        isSyncingPrices={isSyncingPrices}
      />
      <InvestmentStatCards {...stats} trends={statTrends} fmtBase={fmtBase} />
      <PortfolioChart data={portfolioHistory} baseCurrency={baseCurrency} fmtBase={fmtBase} />
      <Card padding="none" className="overflow-hidden">
        <TabSwitcher tab={ui.tab} onSetTab={ui.setTab} />
        <InvestmentTabPanel
          tab={ui.tab}
          activeHoldings={activeHoldings}
          closedHoldings={closedHoldings}
          holdingTxns={holdingTxns}
          properties={properties}
          propertyTxns={propertyTxns}
          mortgageById={mortgageById}
          mortgageTxns={mortgageTxns}
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
      </Card>
    </PageStack>
  );
}

// The active mortgages by id, and with their repayments, what each property owes over time.
function usePropertyDebts(mortgages: Mortgage[], mortgageTxns: MortgageTransaction[]) {
  return useMemo(() => {
    const mortgageById = new Map(mortgages.map((mortgage) => [mortgage.id, mortgage]));
    const propertyDebts: PropertyDebts = {
      mortgageById,
      repaymentsByMortgage: groupMortgageRepayments(mortgageTxns),
    };
    return { mortgageById, propertyDebts };
  }, [mortgages, mortgageTxns]);
}

function useHoldingsByPosition(holdings: Holding[], positions: Record<number, Position>) {
  return useMemo(() => {
    const active: Holding[] = [];
    const closed: Holding[] = [];

    for (const holding of holdings) {
      const shares = positions[holding.id]?.shares ?? 0;
      if (shares > 0) active.push(holding);
      else closed.push(holding);
    }

    return { activeHoldings: active, closedHoldings: closed };
  }, [holdings, positions]);
}

function LoadedInvestments({ data }: Readonly<{ data: InvestmentData }>) {
  const { fmtBase, convertToBase, isForeign, baseCurrency, fmtNative } = useCurrency();
  const { holdings, holdingTxns, properties, propertyTxns, mortgages, mortgageTxns } = data;
  const syncHoldingPrices = useSyncHoldingPrices();
  const ui = useInvestmentUIState();

  const { mortgageById, propertyDebts } = usePropertyDebts(mortgages, mortgageTxns);
  const positions = useInvestmentPositions(holdings, holdingTxns);
  const { activeHoldings, closedHoldings } = useHoldingsByPosition(holdings, positions);
  const stats = useInvestmentPortfolioStats(
    activeHoldings,
    positions,
    properties,
    propertyTxns,
    convertToBase,
  );
  const statTrends = useInvestmentStatTrends(
    activeHoldings,
    holdingTxns,
    properties,
    propertyTxns,
    propertyDebts,
    convertToBase,
    stats,
    fmtBase,
  );
  const actions = useInvestmentActions(holdings, properties, ui);
  const priceHistoryQuery = useHoldingPriceHistory(holdings.map((holding) => holding.id));
  const holdingPriceHistory = priceHistoryQuery.data ?? [];
  const portfolioHistory = usePortfolioHistory(
    holdings,
    holdingTxns,
    holdingPriceHistory,
    properties,
    propertyTxns,
    propertyDebts,
    convertToBase,
  );

  return (
    <InvestmentPageBody
      activeHoldings={activeHoldings}
      closedHoldings={closedHoldings}
      holdingTxns={holdingTxns}
      properties={properties}
      propertyTxns={propertyTxns}
      mortgageById={mortgageById}
      mortgageTxns={mortgageTxns}
      positions={positions}
      stats={stats}
      statTrends={statTrends}
      portfolioHistory={portfolioHistory}
      ui={ui}
      actions={actions}
      baseCurrency={baseCurrency}
      fmtBase={fmtBase}
      fmtNative={fmtNative}
      convertToBase={convertToBase}
      isForeign={isForeign}
      onSyncPrices={() =>
        syncHoldingPrices.mutate({ holdingIds: activeHoldings.map((holding) => holding.id) })
      }
      isSyncingPrices={syncHoldingPrices.isPending}
      syncSummary={syncHoldingPrices.data ?? null}
      priceHistoryFailed={priceHistoryQuery.isError}
      onRetryPriceHistory={() => void priceHistoryQuery.refetch()}
    />
  );
}

export function Investments() {
  const data = useInvestmentData();

  if (data.isLoading) return <LoadingSpinner />;
  if (data.queryFailures.length > 0) {
    return <RouteQueryErrorState routeName="Investments" failedQueries={data.queryFailures} />;
  }

  return <LoadedInvestments data={data} />;
}
