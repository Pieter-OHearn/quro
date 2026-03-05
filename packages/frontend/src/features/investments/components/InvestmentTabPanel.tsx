import type {
  Holding,
  HoldingPriceSyncResult,
  HoldingTransaction,
  Mortgage,
  Property,
  PropertyTransaction,
} from '@quro/shared';
import type {
  ConvertToBaseFn,
  InvestmentActions,
  InvestmentFormatFn,
  InvestmentNativeFormatFn,
  InvestmentPortfolioStats,
  InvestmentUIState,
  IsForeignFn,
  Tab,
} from '../types';
import type { Position } from '../utils/position';
import { BrokerageTab } from './BrokerageTab';
import { PropertyTab } from './PropertyTab';

type InvestmentTabPanelProps = {
  tab: Tab;
  holdings: Holding[];
  holdingTxns: HoldingTransaction[];
  properties: Property[];
  propertyTxns: PropertyTransaction[];
  mortgageById: Map<number, Mortgage>;
  positions: Record<number, Position>;
  stats: InvestmentPortfolioStats;
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

export function InvestmentTabPanel({
  tab,
  holdings,
  holdingTxns,
  properties,
  propertyTxns,
  mortgageById,
  positions,
  stats,
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
}: InvestmentTabPanelProps) {
  if (tab === 'brokerage') {
    return (
      <BrokerageTab
        holdings={holdings}
        holdingTxns={holdingTxns}
        positions={positions}
        baseCurrency={baseCurrency}
        totalDividendsBase={stats.totalDividendsBase}
        totalRealizedBase={stats.totalRealizedBase}
        totalBrokerageBase={stats.totalBrokerageBase}
        totalGainBase={stats.totalGainBase}
        gainPct={stats.gainPct}
        expandedHoldingId={ui.expandedHoldingId}
        fmtBase={fmtBase}
        fmtNative={fmtNative}
        convertToBase={convertToBase}
        isForeign={isForeign}
        onAddHolding={() => {
          ui.setEditingHolding(null);
          ui.setShowAddHolding(true);
        }}
        onEditHolding={ui.setEditingHolding}
        onToggleExpanded={(id) => ui.setExpandedHoldingId(ui.expandedHoldingId === id ? null : id)}
        onAddTxnForHolding={ui.setAddTxnForHolding}
        onDeleteTxn={actions.handleDeleteHoldingTxn}
        onSyncPrices={onSyncPrices}
        isSyncingPrices={isSyncingPrices}
        syncSummary={syncSummary}
      />
    );
  }

  return (
    <PropertyTab
      properties={properties}
      propertyTxns={propertyTxns}
      mortgageById={mortgageById}
      expandedPropertyId={ui.expandedPropertyId}
      fmtNative={fmtNative}
      onAddProperty={() => ui.setShowAddProperty(true)}
      onUpdateProperty={ui.setUpdatingProperty}
      onToggleExpanded={(id) => ui.setExpandedPropertyId(ui.expandedPropertyId === id ? null : id)}
      onAddTxnForProperty={ui.setAddTxnForProperty}
      onDeleteTxn={actions.handleDeletePropertyTxn}
    />
  );
}
