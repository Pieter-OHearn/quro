import type {
  Holding,
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
};

export type InvestmentUIState = {
  tab: Tab;
  editingHolding: Holding | null;
  showAddHolding: boolean;
  addTxnForHolding: Holding | null;
  expandedHoldingId: number | null;
  updatingProperty: Property | null;
  showAddProperty: boolean;
  addTxnForProperty: Property | null;
  expandedPropertyId: number | null;
  setTab: (tab: Tab) => void;
  setEditingHolding: (holding: Holding | null) => void;
  setShowAddHolding: (show: boolean) => void;
  setAddTxnForHolding: (holding: Holding | null) => void;
  setExpandedHoldingId: (id: number | null) => void;
  setUpdatingProperty: (property: Property | null) => void;
  setShowAddProperty: (show: boolean) => void;
  setAddTxnForProperty: (property: Property | null) => void;
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

export type InvestmentActions = {
  handleSaveHolding: (
    holding: Holding,
    initialBuy?: { shares: number; price: number; date: string },
  ) => void;
  handleDeleteHolding: (id: number) => void;
  handleAddHoldingTxn: (transaction: Omit<HoldingTransaction, 'id'>) => void;
  handleDeleteHoldingTxn: (id: number) => void;
  handleUpdateProperty: (id: number, value: number, rent: number) => void;
  handleSaveProperty: (property: Omit<Property, 'id'>) => void;
  handleAddPropertyTxn: (transaction: Omit<PropertyTransaction, 'id'>) => void;
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
  positions: Record<number, Position>;
  onCloseEditHolding: () => void;
  onSaveHolding: (
    holding: Holding,
    initialBuy?: { shares: number; price: number; date: string },
  ) => void;
  onDeleteHolding: (id: number) => void;
  onCloseAddHoldingTxn: () => void;
  onSaveHoldingTxn: (transaction: Omit<HoldingTransaction, 'id'>) => void;
};

export type PropertyModalsProps = {
  updatingProperty: Property | null;
  showAddProperty: boolean;
  addTxnForProperty: Property | null;
  mortgageById: Map<number, Mortgage>;
  onCloseUpdateProperty: () => void;
  onSaveUpdateProperty: (id: number, value: number, rent: number) => void;
  onCloseAddProperty: () => void;
  onSaveAddProperty: (property: Omit<Property, 'id'>) => void;
  onCloseAddPropertyTxn: () => void;
  onSavePropertyTxn: (transaction: Omit<PropertyTransaction, 'id'>) => void;
};
