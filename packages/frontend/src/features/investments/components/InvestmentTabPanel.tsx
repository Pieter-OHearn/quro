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
  activeHoldings: Holding[];
  closedHoldings: Holding[];
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

function renderBrokerageTab({
  activeHoldings,
  closedHoldings,
  holdingTxns,
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
  const handleAddHolding = () => {
    ui.setEditingHolding(null);
    ui.setShowAddHolding(true);
  };
  const toggleHoldingExpanded = (id: number) =>
    ui.setExpandedHoldingId(ui.expandedHoldingId === id ? null : id);
  const handleAddTxnForHolding = (holding: Holding) => {
    ui.setEditingHoldingTxn(null);
    ui.setAddTxnForHolding(holding);
  };
  const handleEditHoldingTxn = (transaction: HoldingTransaction) => {
    ui.setAddTxnForHolding(null);
    ui.setEditingHoldingTxn(transaction);
  };

  return (
    <BrokerageTab
      activeHoldings={activeHoldings}
      closedHoldings={closedHoldings}
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
      onAddHolding={handleAddHolding}
      onEditHolding={ui.setEditingHolding}
      onToggleExpanded={toggleHoldingExpanded}
      onAddTxnForHolding={handleAddTxnForHolding}
      onEditTxn={handleEditHoldingTxn}
      onDeleteTxn={actions.handleDeleteHoldingTxn}
      onSyncPrices={onSyncPrices}
      isSyncingPrices={isSyncingPrices}
      syncSummary={syncSummary}
    />
  );
}

function renderPropertyTab({
  properties,
  propertyTxns,
  mortgageById,
  ui,
  actions,
  fmtNative,
}: InvestmentTabPanelProps) {
  const handleAddProperty = () => ui.setShowAddProperty(true);
  const togglePropertyExpanded = (id: number) =>
    ui.setExpandedPropertyId(ui.expandedPropertyId === id ? null : id);
  const handleAddTxnForProperty = (property: Property) => {
    ui.setEditingPropertyTxn(null);
    ui.setAddTxnForProperty(property);
  };
  const handleEditPropertyTxn = (transaction: PropertyTransaction) => {
    ui.setAddTxnForProperty(null);
    ui.setEditingPropertyTxn(transaction);
  };

  return (
    <PropertyTab
      properties={properties}
      propertyTxns={propertyTxns}
      mortgageById={mortgageById}
      expandedPropertyId={ui.expandedPropertyId}
      fmtNative={fmtNative}
      onAddProperty={handleAddProperty}
      onUpdateProperty={ui.setUpdatingProperty}
      onToggleExpanded={togglePropertyExpanded}
      onAddTxnForProperty={handleAddTxnForProperty}
      onEditTxn={handleEditPropertyTxn}
      onDeleteTxn={actions.handleDeletePropertyTxn}
    />
  );
}

export function InvestmentTabPanel(props: InvestmentTabPanelProps) {
  if (props.tab === 'brokerage') {
    return renderBrokerageTab(props);
  }

  return renderPropertyTab(props);
}
