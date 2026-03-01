import { useMemo, useState } from 'react';
import { BarChart2, Building2, DollarSign, TrendingUp } from 'lucide-react';
import { LoadingSpinner, StatCard } from '@/components/ui';
import { useCurrency } from '@/lib/CurrencyContext';
import type {
  Holding,
  HoldingTransaction,
  Mortgage,
  Property,
  PropertyTransaction,
} from '@quro/shared';
import {
  useHoldings,
  useHoldingTransactions,
  useCreateHolding,
  useUpdateHolding,
  useDeleteHolding,
  useCreateHoldingTransaction,
  useDeleteHoldingTransaction,
  useProperties,
  usePropertyTransactions,
  useCreateProperty,
  useUpdateProperty,
  useDeleteProperty,
  useCreatePropertyTransaction,
  useDeletePropertyTransaction,
} from './hooks';
import { useMortgages } from '../mortgage/hooks';
import {
  addMonthsUtc,
  computePosition,
  formatMonthLabel,
  getPropertyMortgageBalance,
  monthEndUtc,
  monthStartUtc,
  toUtcTimestamp,
  type DatedHoldingTransaction,
  type DatedPropertyTransaction,
  type Position,
} from './utils/position';
import { AddHoldingTxnModal } from './components/AddHoldingTxnModal';
import { EditHoldingModal } from './components/EditHoldingModal';
import { AddPropertyTxnModal } from './components/AddPropertyTxnModal';
import { AddPropertyModal } from './components/AddPropertyModal';
import { UpdatePropertyModal } from './components/UpdatePropertyModal';
import { PortfolioChart } from './components/PortfolioChart';
import { BrokerageTab } from './components/BrokerageTab';
import { PropertyTab } from './components/PropertyTab';

type Tab = 'brokerage' | 'property';

const EMPTY_POSITION: Position = {
  shares: 0,
  avgCost: 0,
  realizedGain: 0,
  totalDividends: 0,
};

function buildHoldingTxnMap(datedHoldingTxns: DatedHoldingTransaction[]) {
  const map = new Map<number, DatedHoldingTransaction[]>();
  for (const transaction of datedHoldingTxns) {
    const bucket = map.get(transaction.holdingId);
    if (bucket) bucket.push(transaction);
    else map.set(transaction.holdingId, [transaction]);
  }
  for (const txns of map.values()) {
    txns.sort((a, b) => a.timestamp - b.timestamp);
  }
  return map;
}

function buildPropertyTxnMap(datedPropertyTxns: DatedPropertyTransaction[]) {
  const map = new Map<number, DatedPropertyTransaction[]>();
  for (const transaction of datedPropertyTxns) {
    const bucket = map.get(transaction.propertyId);
    if (bucket) bucket.push(transaction);
    else map.set(transaction.propertyId, [transaction]);
  }
  for (const txns of map.values()) {
    txns.sort((a, b) => a.timestamp - b.timestamp);
  }
  return map;
}

function computeBrokerageForMonth(
  holdings: Holding[],
  holdingTxnMap: Map<number, DatedHoldingTransaction[]>,
  cutoff: number,
  convertToBase: (value: number, currency: string) => number,
) {
  return holdings.reduce((sum, holding) => {
    const txns = holdingTxnMap.get(holding.id) ?? [];
    let shares = 0;
    let dividends = 0;

    for (const transaction of txns) {
      if (transaction.timestamp > cutoff) break;
      const txnShares = Number(transaction.shares ?? 0);
      if (transaction.type === 'buy' && txnShares > 0) {
        shares += txnShares;
      } else if (transaction.type === 'sell' && txnShares > 0) {
        shares = Math.max(0, shares - txnShares);
      } else if (transaction.type === 'dividend') {
        dividends += transaction.price;
      }
    }

    const nativeValue = Math.max(0, shares) * holding.currentPrice + dividends;
    return sum + convertToBase(nativeValue, holding.currency);
  }, 0);
}

function getPropertyEquity(
  property: Property,
  txns: DatedPropertyTransaction[],
  cutoff: number,
  mortgageById: Map<number, Mortgage>,
  convertToBase: (value: number, currency: string) => number,
): number {
  const hasValuationTxn = txns.some((t) => t.type === 'valuation');
  let value = hasValuationTxn ? property.purchasePrice : property.currentValue;
  for (const t of txns) {
    if (t.timestamp > cutoff) break;
    if (t.type === 'valuation') value = t.amount;
  }
  let mortgage = getPropertyMortgageBalance(property, mortgageById);
  for (const t of txns) {
    if (t.timestamp <= cutoff || t.type !== 'repayment') continue;
    const principal = t.principal ?? Math.max(0, t.amount - (t.interest ?? 0));
    mortgage += principal;
  }
  return convertToBase(value - mortgage, property.currency);
}

function computePropertyEquityForMonth(
  properties: Property[],
  propertyTxnMap: Map<number, DatedPropertyTransaction[]>,
  cutoff: number,
  mortgageById: Map<number, Mortgage>,
  convertToBase: (value: number, currency: string) => number,
) {
  return properties.reduce(
    (sum, property) =>
      sum +
      getPropertyEquity(
        property,
        propertyTxnMap.get(property.id) ?? [],
        cutoff,
        mortgageById,
        convertToBase,
      ),
    0,
  );
}

function computePortfolioHistory(
  holdings: Holding[],
  holdingTxns: HoldingTransaction[],
  properties: Property[],
  propertyTxns: PropertyTransaction[],
  mortgageById: Map<number, Mortgage>,
  convertToBase: (value: number, currency: string) => number,
) {
  const datedHoldingTxns: DatedHoldingTransaction[] = holdingTxns
    .map((transaction) => ({ ...transaction, timestamp: toUtcTimestamp(transaction.date) }))
    .filter((transaction) => Number.isFinite(transaction.timestamp));
  const datedPropertyTxns: DatedPropertyTransaction[] = propertyTxns
    .map((transaction) => ({ ...transaction, timestamp: toUtcTimestamp(transaction.date) }))
    .filter((transaction) => Number.isFinite(transaction.timestamp));

  const allTimestamps = [
    ...datedHoldingTxns.map((transaction) => transaction.timestamp),
    ...datedPropertyTxns.map((transaction) => transaction.timestamp),
  ];

  if (allTimestamps.length === 0) return [];

  const currentMonthStart = monthStartUtc(Date.now());
  const earliestMonth = monthStartUtc(Math.min(...allTimestamps));
  const oldestVisibleMonth = addMonthsUtc(currentMonthStart, -11);
  const firstMonth = Math.max(earliestMonth, oldestVisibleMonth);

  const holdingTxnMap = buildHoldingTxnMap(datedHoldingTxns);
  const propertyTxnMap = buildPropertyTxnMap(datedPropertyTxns);

  const months: number[] = [];
  for (let month = firstMonth; month <= currentMonthStart; month = addMonthsUtc(month, 1)) {
    months.push(month);
  }

  return months.map((month) => {
    const cutoff = monthEndUtc(month);
    const brokerage = computeBrokerageForMonth(holdings, holdingTxnMap, cutoff, convertToBase);
    const propertyEquity = computePropertyEquityForMonth(
      properties,
      propertyTxnMap,
      cutoff,
      mortgageById,
      convertToBase,
    );
    return { month: formatMonthLabel(month), brokerage, propertyEquity };
  });
}

function computeTotalRental(
  propertyTxns: PropertyTransaction[],
  properties: Property[],
  convertToBase: (value: number, currency: string) => number,
) {
  const currentMonth = new Date().toISOString().slice(0, 7);
  const rentalTxns = propertyTxns.filter(
    (transaction) =>
      transaction.type === 'rent_income' && transaction.date.startsWith(currentMonth),
  );

  if (rentalTxns.length === 0) {
    return properties.reduce(
      (sum, property) => sum + convertToBase(property.monthlyRent, property.currency),
      0,
    );
  }

  const propertyById = new Map(properties.map((property) => [property.id, property]));
  return rentalTxns.reduce((sum, transaction) => {
    const property = propertyById.get(transaction.propertyId);
    return sum + convertToBase(transaction.amount, property?.currency ?? 'EUR');
  }, 0);
}

type HoldingModalsProps = {
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
  onSaveHoldingTxn: (t: Omit<HoldingTransaction, 'id'>) => void;
};

function HoldingModals({
  showAddHolding,
  editingHolding,
  addTxnForHolding,
  positions,
  onCloseEditHolding,
  onSaveHolding,
  onDeleteHolding,
  onCloseAddHoldingTxn,
  onSaveHoldingTxn,
}: HoldingModalsProps) {
  return (
    <>
      {(showAddHolding || editingHolding) && (
        <EditHoldingModal
          existing={editingHolding ?? undefined}
          onClose={onCloseEditHolding}
          onSave={onSaveHolding}
          onDelete={onDeleteHolding}
        />
      )}
      {addTxnForHolding && (
        <AddHoldingTxnModal
          holding={addTxnForHolding}
          currentPosition={positions[addTxnForHolding.id] ?? EMPTY_POSITION}
          onClose={onCloseAddHoldingTxn}
          onSave={onSaveHoldingTxn}
        />
      )}
    </>
  );
}

type PropertyModalsProps = {
  updatingProperty: Property | null;
  showAddProperty: boolean;
  addTxnForProperty: Property | null;
  mortgageById: Map<number, Mortgage>;
  onCloseUpdateProperty: () => void;
  onSaveUpdateProperty: (id: number, value: number, rent: number) => void;
  onCloseAddProperty: () => void;
  onSaveAddProperty: (p: Omit<Property, 'id'>) => void;
  onCloseAddPropertyTxn: () => void;
  onSavePropertyTxn: (t: Omit<PropertyTransaction, 'id'>) => void;
};

function PropertyModals({
  updatingProperty,
  showAddProperty,
  addTxnForProperty,
  mortgageById,
  onCloseUpdateProperty,
  onSaveUpdateProperty,
  onCloseAddProperty,
  onSaveAddProperty,
  onCloseAddPropertyTxn,
  onSavePropertyTxn,
}: PropertyModalsProps) {
  return (
    <>
      {updatingProperty && (
        <UpdatePropertyModal
          property={updatingProperty}
          mortgageBalance={getPropertyMortgageBalance(updatingProperty, mortgageById)}
          onClose={onCloseUpdateProperty}
          onSave={onSaveUpdateProperty}
        />
      )}
      {showAddProperty && (
        <AddPropertyModal onClose={onCloseAddProperty} onSave={onSaveAddProperty} />
      )}
      {addTxnForProperty && (
        <AddPropertyTxnModal
          property={addTxnForProperty}
          mortgageBalance={getPropertyMortgageBalance(addTxnForProperty, mortgageById)}
          onClose={onCloseAddPropertyTxn}
          onSave={onSavePropertyTxn}
        />
      )}
    </>
  );
}

type InvestmentModalsProps = {
  holdingModals: HoldingModalsProps;
  propertyModals: PropertyModalsProps;
};

function InvestmentModals({ holdingModals, propertyModals }: InvestmentModalsProps) {
  return (
    <>
      <HoldingModals {...holdingModals} />
      <PropertyModals {...propertyModals} />
    </>
  );
}

type TabSwitcherProps = {
  tab: Tab;
  onSetTab: (tab: Tab) => void;
};

function TabSwitcher({ tab, onSetTab }: TabSwitcherProps) {
  return (
    <div className="flex border-b border-slate-100">
      <button
        onClick={() => onSetTab('brokerage')}
        className={`flex-1 flex items-center justify-center gap-2 py-4 text-sm font-medium transition-colors ${
          tab === 'brokerage'
            ? 'text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50/40'
            : 'text-slate-500 hover:text-slate-700'
        }`}
      >
        <BarChart2 size={16} /> Brokerage Holdings
      </button>
      <button
        onClick={() => onSetTab('property')}
        className={`flex-1 flex items-center justify-center gap-2 py-4 text-sm font-medium transition-colors ${
          tab === 'property'
            ? 'text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50/40'
            : 'text-slate-500 hover:text-slate-700'
        }`}
      >
        <Building2 size={16} /> Property Portfolio
      </button>
    </div>
  );
}

type InvestmentUIState = {
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
  setEditingHolding: (h: Holding | null) => void;
  setShowAddHolding: (v: boolean) => void;
  setAddTxnForHolding: (h: Holding | null) => void;
  setExpandedHoldingId: (id: number | null) => void;
  setUpdatingProperty: (p: Property | null) => void;
  setShowAddProperty: (v: boolean) => void;
  setAddTxnForProperty: (p: Property | null) => void;
  setExpandedPropertyId: (id: number | null) => void;
};

function useInvestmentUIState(): InvestmentUIState {
  const [tab, setTab] = useState<Tab>('brokerage');
  const [editingHolding, setEditingHolding] = useState<Holding | null>(null);
  const [showAddHolding, setShowAddHolding] = useState(false);
  const [addTxnForHolding, setAddTxnForHolding] = useState<Holding | null>(null);
  const [expandedHoldingId, setExpandedHoldingId] = useState<number | null>(null);
  const [updatingProperty, setUpdatingProperty] = useState<Property | null>(null);
  const [showAddProperty, setShowAddProperty] = useState(false);
  const [addTxnForProperty, setAddTxnForProperty] = useState<Property | null>(null);
  const [expandedPropertyId, setExpandedPropertyId] = useState<number | null>(null);
  return {
    tab,
    editingHolding,
    showAddHolding,
    addTxnForHolding,
    expandedHoldingId,
    updatingProperty,
    showAddProperty,
    addTxnForProperty,
    expandedPropertyId,
    setTab,
    setEditingHolding,
    setShowAddHolding,
    setAddTxnForHolding,
    setExpandedHoldingId,
    setUpdatingProperty,
    setShowAddProperty,
    setAddTxnForProperty,
    setExpandedPropertyId,
  };
}

function useInvestmentPortfolioStats(
  holdings: Holding[],
  positions: Record<number, Position>,
  properties: Property[],
  propertyTxns: PropertyTransaction[],
  mortgageById: Map<number, Mortgage>,
  convertToBase: (value: number, currency: string) => number,
) {
  const totalBrokerageBase = useMemo(
    () =>
      holdings.reduce(
        (sum, h) => sum + convertToBase(positions[h.id].shares * h.currentPrice, h.currency),
        0,
      ),
    [holdings, positions, convertToBase],
  );
  const totalCostBase = useMemo(
    () =>
      holdings.reduce(
        (sum, h) =>
          sum + convertToBase(positions[h.id].shares * positions[h.id].avgCost, h.currency),
        0,
      ),
    [holdings, positions, convertToBase],
  );
  const totalDividendsBase = useMemo(
    () =>
      holdings.reduce(
        (sum, h) => sum + convertToBase(positions[h.id].totalDividends, h.currency),
        0,
      ),
    [holdings, positions, convertToBase],
  );
  const totalRealizedBase = useMemo(
    () =>
      holdings.reduce((sum, h) => sum + convertToBase(positions[h.id].realizedGain, h.currency), 0),
    [holdings, positions, convertToBase],
  );
  const totalPropertyEquityBase = properties.reduce((sum, p) => {
    return (
      sum + convertToBase(p.currentValue - getPropertyMortgageBalance(p, mortgageById), p.currency)
    );
  }, 0);
  const totalRentalBase = useMemo(
    () => computeTotalRental(propertyTxns, properties, convertToBase),
    [propertyTxns, properties, convertToBase],
  );
  const totalGainBase = totalBrokerageBase - totalCostBase;
  const gainPct = totalCostBase > 0 ? (totalGainBase / totalCostBase) * 100 : 0;
  return {
    totalBrokerageBase,
    totalCostBase,
    totalGainBase,
    gainPct,
    totalDividendsBase,
    totalRealizedBase,
    totalPropertyEquityBase,
    totalRentalBase,
  };
}

type InvestmentStatCardsProps = {
  totalBrokerageBase: number;
  totalGainBase: number;
  totalCostBase: number;
  gainPct: number;
  totalDividendsBase: number;
  totalRealizedBase: number;
  totalPropertyEquityBase: number;
  totalRentalBase: number;
  fmtBase: (value: number, currency?: string, compact?: boolean) => string;
};

function InvestmentStatCards({
  totalBrokerageBase,
  totalGainBase,
  totalCostBase,
  gainPct,
  totalDividendsBase,
  totalRealizedBase,
  totalPropertyEquityBase,
  totalRentalBase,
  fmtBase,
}: InvestmentStatCardsProps) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <StatCard
        label="Brokerage Value"
        value={fmtBase(totalBrokerageBase)}
        subtitle={`${gainPct >= 0 ? '+' : ''}${gainPct.toFixed(1)}% unrealized`}
        icon={BarChart2}
        color="indigo"
        change={{
          value: `${gainPct >= 0 ? '+' : ''}${gainPct.toFixed(1)}%`,
          positive: gainPct >= 0,
        }}
      />
      <StatCard
        label="Unrealized Gain"
        value={`${totalGainBase >= 0 ? '+' : ''}${fmtBase(Math.abs(totalGainBase))}`}
        subtitle={`Cost basis ${fmtBase(totalCostBase)}`}
        icon={TrendingUp}
        color="emerald"
        change={{
          value: `${totalGainBase >= 0 ? '+' : ''}${fmtBase(Math.abs(totalGainBase), undefined, true)}`,
          positive: totalGainBase >= 0,
        }}
      />
      <StatCard
        label="Dividends Received"
        value={`+${fmtBase(totalDividendsBase)}`}
        subtitle={`${totalRealizedBase >= 0 ? '+' : ''}${fmtBase(totalRealizedBase)} realized`}
        icon={DollarSign}
        color="sky"
        change={{
          value: `${totalRealizedBase >= 0 ? '+' : ''}${fmtBase(Math.abs(totalRealizedBase), undefined, true)}`,
          positive: totalRealizedBase >= 0,
        }}
      />
      <StatCard
        label="Property Equity"
        value={fmtBase(totalPropertyEquityBase)}
        subtitle={`${fmtBase(totalRentalBase)}/mo rental`}
        icon={Building2}
        color="amber"
        change={{
          value: `${fmtBase(totalRentalBase, undefined, true)}/mo`,
          positive: totalRentalBase >= 0,
        }}
      />
    </div>
  );
}

function useHoldingActions(holdings: Holding[], ui: InvestmentUIState) {
  const createHolding = useCreateHolding();
  const updateHolding = useUpdateHolding();
  const deleteHolding = useDeleteHolding();
  const createHoldingTxn = useCreateHoldingTransaction();
  const deleteHoldingTxn = useDeleteHoldingTransaction();

  function handleSaveHolding(
    holding: Holding,
    initialBuy?: { shares: number; price: number; date: string },
  ) {
    if (holdings.find((entry) => entry.id === holding.id)) {
      updateHolding.mutate(holding);
      return;
    }
    const { id: _id, ...body } = holding;
    createHolding.mutate(body, {
      onSuccess: (created: Holding) => {
        if (!initialBuy) return;
        createHoldingTxn.mutate({
          holdingId: created.id,
          type: 'buy',
          shares: initialBuy.shares,
          price: initialBuy.price,
          date: initialBuy.date,
          note: 'Initial position',
        });
        ui.setExpandedHoldingId(created.id);
      },
    });
  }

  return {
    handleSaveHolding,
    handleDeleteHolding: (id: number) => {
      deleteHolding.mutate(id);
      if (ui.expandedHoldingId === id) ui.setExpandedHoldingId(null);
    },
    handleAddHoldingTxn: (t: Omit<HoldingTransaction, 'id'>) => createHoldingTxn.mutate(t),
    handleDeleteHoldingTxn: (id: number) => deleteHoldingTxn.mutate(id),
  };
}

function usePropertyActions(properties: Property[], ui: InvestmentUIState) {
  const createProperty = useCreateProperty();
  const updatePropertyMut = useUpdateProperty();
  useDeleteProperty();
  const createPropertyTxn = useCreatePropertyTransaction();
  const deletePropertyTxn = useDeletePropertyTransaction();

  return {
    handleUpdateProperty: (id: number, value: number, rent: number) => {
      const existing = properties.find((p) => p.id === id);
      if (existing)
        updatePropertyMut.mutate({ ...existing, currentValue: value, monthlyRent: rent });
    },
    handleSaveProperty: (property: Omit<Property, 'id'>) => {
      createProperty.mutate(property);
      ui.setShowAddProperty(false);
    },
    handleAddPropertyTxn: (t: Omit<PropertyTransaction, 'id'>) => createPropertyTxn.mutate(t),
    handleDeletePropertyTxn: (id: number) => deletePropertyTxn.mutate(id),
  };
}

function useInvestmentActions(holdings: Holding[], properties: Property[], ui: InvestmentUIState) {
  const holdingActions = useHoldingActions(holdings, ui);
  const propertyActions = usePropertyActions(properties, ui);
  return { ...holdingActions, ...propertyActions };
}

function useInvestmentData() {
  const { data: holdings = [], isLoading: loadingHoldings } = useHoldings();
  const { data: holdingTxns = [], isLoading: loadingHoldingTxns } = useHoldingTransactions();
  const { data: properties = [], isLoading: loadingProperties } = useProperties();
  const { data: propertyTxns = [], isLoading: loadingPropertyTxns } = usePropertyTransactions();
  const { data: mortgages = [], isLoading: loadingMortgages } = useMortgages();
  const isLoading =
    loadingHoldings ||
    loadingHoldingTxns ||
    loadingProperties ||
    loadingPropertyTxns ||
    loadingMortgages;
  return { holdings, holdingTxns, properties, propertyTxns, mortgages, isLoading };
}

type InvestmentPageBodyProps = {
  holdings: Holding[];
  holdingTxns: HoldingTransaction[];
  properties: Property[];
  propertyTxns: PropertyTransaction[];
  mortgageById: Map<number, Mortgage>;
  positions: Record<number, Position>;
  stats: ReturnType<typeof useInvestmentPortfolioStats>;
  portfolioHistory: { month: string; brokerage: number; propertyEquity: number }[];
  ui: InvestmentUIState;
  actions: ReturnType<typeof useInvestmentActions>;
  baseCurrency: string;
  fmtBase: (value: number, currency?: string, compact?: boolean) => string;
  fmtNative: (value: number, currency: string, compact?: boolean) => string;
  convertToBase: (value: number, currency: string) => number;
  isForeign: (currency: string) => boolean;
};

function InvestmentTabPanel({
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
}: Omit<InvestmentPageBodyProps, 'portfolioHistory'> & { tab: Tab }) {
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
}: InvestmentPageBodyProps) {
  return (
    <div className="p-6 space-y-6">
      <InvestmentModals
        holdingModals={{
          showAddHolding: ui.showAddHolding,
          editingHolding: ui.editingHolding,
          addTxnForHolding: ui.addTxnForHolding,
          positions,
          onCloseEditHolding: () => {
            ui.setShowAddHolding(false);
            ui.setEditingHolding(null);
          },
          onSaveHolding: actions.handleSaveHolding,
          onDeleteHolding: actions.handleDeleteHolding,
          onCloseAddHoldingTxn: () => ui.setAddTxnForHolding(null),
          onSaveHoldingTxn: actions.handleAddHoldingTxn,
        }}
        propertyModals={{
          updatingProperty: ui.updatingProperty,
          showAddProperty: ui.showAddProperty,
          addTxnForProperty: ui.addTxnForProperty,
          mortgageById,
          onCloseUpdateProperty: () => ui.setUpdatingProperty(null),
          onSaveUpdateProperty: actions.handleUpdateProperty,
          onCloseAddProperty: () => ui.setShowAddProperty(false),
          onSaveAddProperty: actions.handleSaveProperty,
          onCloseAddPropertyTxn: () => ui.setAddTxnForProperty(null),
          onSavePropertyTxn: actions.handleAddPropertyTxn,
        }}
      />
      <InvestmentStatCards
        totalBrokerageBase={stats.totalBrokerageBase}
        totalGainBase={stats.totalGainBase}
        totalCostBase={stats.totalCostBase}
        gainPct={stats.gainPct}
        totalDividendsBase={stats.totalDividendsBase}
        totalRealizedBase={stats.totalRealizedBase}
        totalPropertyEquityBase={stats.totalPropertyEquityBase}
        totalRentalBase={stats.totalRentalBase}
        fmtBase={fmtBase}
      />
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
        />
      </div>
    </div>
  );
}

export function Investments() {
  const { fmtBase, convertToBase, isForeign, baseCurrency, fmtNative } = useCurrency();
  const { holdings, holdingTxns, properties, propertyTxns, mortgages, isLoading } =
    useInvestmentData();
  const ui = useInvestmentUIState();

  const mortgageById = useMemo(() => {
    const map = new Map<number, Mortgage>();
    for (const mortgage of mortgages) map.set(mortgage.id, mortgage);
    return map;
  }, [mortgages]);

  const positions = useMemo<Record<number, Position>>(() => {
    const result: Record<number, Position> = {};
    holdings.forEach((h) => {
      result[h.id] = computePosition(h.id, holdingTxns);
    });
    return result;
  }, [holdings, holdingTxns]);

  const stats = useInvestmentPortfolioStats(
    holdings,
    positions,
    properties,
    propertyTxns,
    mortgageById,
    convertToBase,
  );
  const actions = useInvestmentActions(holdings, properties, ui);
  const portfolioHistory = useMemo(
    () =>
      computePortfolioHistory(
        holdings,
        holdingTxns,
        properties,
        propertyTxns,
        mortgageById,
        convertToBase,
      ),
    [holdings, holdingTxns, properties, propertyTxns, convertToBase, mortgageById],
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
    />
  );
}
