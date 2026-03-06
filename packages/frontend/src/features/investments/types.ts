import type {
  Holding,
  HoldingPriceSyncResult,
  HoldingTransaction,
  Mortgage,
  Property,
  PropertyTransaction,
} from '@quro/shared';
import type { Position } from './utils/position';

export type Tab = 'brokerage' | 'property';

export type InvestmentFormatFn = (value: number, currency?: string, compact?: boolean) => string;
export type InvestmentNativeFormatFn = (
  value: number,
  currency: string,
  compact?: boolean,
) => string;
export type ConvertToBaseFn = (value: number, currency: string) => number;
export type IsForeignFn = (currency: string) => boolean;

export type PortfolioHistoryPoint = {
  month: string;
  brokerage: number;
  propertyEquity: number;
  isEstimated: boolean;
};

export type SaveHoldingTxnInput = Omit<HoldingTransaction, 'id'> & { id?: number };
export type SavePropertyTxnInput = Omit<PropertyTransaction, 'id'> & { id?: number };

export type InvestmentUIState = {
  tab: Tab;
  editingHolding: Holding | null;
  showAddHolding: boolean;
  addTxnForHolding: Holding | null;
  editingHoldingTxn: HoldingTransaction | null;
  expandedHoldingId: number | null;
  updatingProperty: Property | null;
  showAddProperty: boolean;
  addTxnForProperty: Property | null;
  editingPropertyTxn: PropertyTransaction | null;
  expandedPropertyId: number | null;
  setTab: (tab: Tab) => void;
  setEditingHolding: (holding: Holding | null) => void;
  setShowAddHolding: (show: boolean) => void;
  setAddTxnForHolding: (holding: Holding | null) => void;
  setEditingHoldingTxn: (transaction: HoldingTransaction | null) => void;
  setExpandedHoldingId: (id: number | null) => void;
  setUpdatingProperty: (property: Property | null) => void;
  setShowAddProperty: (show: boolean) => void;
  setAddTxnForProperty: (property: Property | null) => void;
  setEditingPropertyTxn: (transaction: PropertyTransaction | null) => void;
  setExpandedPropertyId: (id: number | null) => void;
};

export type InvestmentPortfolioStats = {
  totalBrokerageBase: number;
  totalCostBase: number;
  totalGainBase: number;
  gainPct: number;
  totalDividendsBase: number;
  totalRealizedBase: number;
  totalPropertyEquityBase: number;
  totalRentalBase: number;
};

export type InvestmentStatTrend = {
  value: string;
  positive: boolean;
  details: string;
};

export type InvestmentStatTrends = {
  brokerageValue: InvestmentStatTrend;
  unrealizedGain: InvestmentStatTrend;
  dividendsReceived: InvestmentStatTrend;
  propertyEquity: InvestmentStatTrend;
};

export type InvestmentActions = {
  handleSaveHolding: (
    holding: Holding,
    initialBuy?: { shares: number; price: number; date: string },
    lookupSnapshot?: {
      priceCurrency?: string | null;
      eodDate?: string | null;
      priceUpdatedAt?: string | null;
    },
  ) => void;
  handleDeleteHolding: (id: number) => void;
  handleAddHoldingTxn: (transaction: SaveHoldingTxnInput) => void;
  handleDeleteHoldingTxn: (id: number) => void;
  handleUpdateProperty: (id: number, value: number, rent: number) => void;
  handleSaveProperty: (property: Omit<Property, 'id'>) => void;
  handleAddPropertyTxn: (transaction: SavePropertyTxnInput) => void;
  handleDeletePropertyTxn: (id: number) => void;
};

export type InvestmentData = {
  holdings: Holding[];
  holdingTxns: HoldingTransaction[];
  properties: Property[];
  propertyTxns: PropertyTransaction[];
  mortgages: Mortgage[];
  isLoading: boolean;
};

export type HoldingModalsProps = {
  showAddHolding: boolean;
  editingHolding: Holding | null;
  addTxnForHolding: Holding | null;
  editingHoldingTxn: HoldingTransaction | null;
  holdings: Holding[];
  holdingTxns: HoldingTransaction[];
  positions: Record<number, Position>;
  onCloseEditHolding: () => void;
  onSaveHolding: (
    holding: Holding,
    initialBuy?: { shares: number; price: number; date: string },
    lookupSnapshot?: {
      priceCurrency?: string | null;
      eodDate?: string | null;
      priceUpdatedAt?: string | null;
    },
  ) => void;
  onDeleteHolding: (id: number) => void;
  onCloseAddHoldingTxn: () => void;
  onSaveHoldingTxn: (transaction: SaveHoldingTxnInput) => void;
};

export type BrokerageSyncProps = {
  onSyncPrices: () => void;
  isSyncingPrices: boolean;
  syncSummary: HoldingPriceSyncResult | null;
};

export type PropertyModalsProps = {
  updatingProperty: Property | null;
  showAddProperty: boolean;
  addTxnForProperty: Property | null;
  editingPropertyTxn: PropertyTransaction | null;
  properties: Property[];
  mortgageById: Map<number, Mortgage>;
  onCloseUpdateProperty: () => void;
  onSaveUpdateProperty: (id: number, value: number, rent: number) => void;
  onCloseAddProperty: () => void;
  onSaveAddProperty: (property: Omit<Property, 'id'>) => void;
  onCloseAddPropertyTxn: () => void;
  onSavePropertyTxn: (transaction: SavePropertyTxnInput) => void;
};
