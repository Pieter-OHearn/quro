import { useMemo, useState } from "react";
import {
  BarChart2,
  Building2,
  DollarSign,
  TrendingUp,
} from "lucide-react";
import { LoadingSpinner, StatCard } from "@/components/ui";
import { useCurrency } from "@/lib/CurrencyContext";
import type {
  Holding,
  HoldingTransaction,
  Mortgage,
  Property,
  PropertyTransaction,
} from "@quro/shared";
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
} from "./hooks";
import { useMortgages } from "../mortgage/hooks";
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
} from "./utils/position";
import { AddHoldingTxnModal } from "./components/AddHoldingTxnModal";
import { EditHoldingModal } from "./components/EditHoldingModal";
import { AddPropertyTxnModal } from "./components/AddPropertyTxnModal";
import { AddPropertyModal } from "./components/AddPropertyModal";
import { UpdatePropertyModal } from "./components/UpdatePropertyModal";
import { PortfolioChart } from "./components/PortfolioChart";
import { BrokerageTab } from "./components/BrokerageTab";
import { PropertyTab } from "./components/PropertyTab";

type Tab = "brokerage" | "property";

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
      if (transaction.type === "buy" && txnShares > 0) {
        shares += txnShares;
      } else if (transaction.type === "sell" && txnShares > 0) {
        shares = Math.max(0, shares - txnShares);
      } else if (transaction.type === "dividend") {
        dividends += transaction.price;
      }
    }

    const nativeValue = Math.max(0, shares) * holding.currentPrice + dividends;
    return sum + convertToBase(nativeValue, holding.currency);
  }, 0);
}

function computePropertyEquityForMonth(
  properties: Property[],
  propertyTxnMap: Map<number, DatedPropertyTransaction[]>,
  cutoff: number,
  mortgageById: Map<number, Mortgage>,
  convertToBase: (value: number, currency: string) => number,
) {
  return properties.reduce((sum, property) => {
    const txns = propertyTxnMap.get(property.id) ?? [];
    const hasValuationTxn = txns.some((transaction) => transaction.type === "valuation");
    let value = hasValuationTxn ? property.purchasePrice : property.currentValue;

    for (const transaction of txns) {
      if (transaction.timestamp > cutoff) break;
      if (transaction.type === "valuation") value = transaction.amount;
    }

    let mortgage = getPropertyMortgageBalance(property, mortgageById);
    for (const transaction of txns) {
      if (transaction.timestamp <= cutoff || transaction.type !== "repayment") continue;
      const principal = transaction.principal ?? Math.max(0, transaction.amount - (transaction.interest ?? 0));
      mortgage += principal;
    }

    return sum + convertToBase(value - mortgage, property.currency);
  }, 0);
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
    const propertyEquity = computePropertyEquityForMonth(properties, propertyTxnMap, cutoff, mortgageById, convertToBase);
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
    (transaction) => transaction.type === "rent_income" && transaction.date.startsWith(currentMonth),
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
    return sum + convertToBase(transaction.amount, property?.currency ?? "EUR");
  }, 0);
}

type InvestmentModalsProps = {
  showAddHolding: boolean;
  editingHolding: Holding | null;
  addTxnForHolding: Holding | null;
  updatingProperty: Property | null;
  showAddProperty: boolean;
  addTxnForProperty: Property | null;
  positions: Record<number, Position>;
  mortgageById: Map<number, Mortgage>;
  onCloseEditHolding: () => void;
  onSaveHolding: (holding: Holding, initialBuy?: { shares: number; price: number; date: string }) => void;
  onDeleteHolding: (id: number) => void;
  onCloseAddHoldingTxn: () => void;
  onSaveHoldingTxn: (t: Omit<HoldingTransaction, "id">) => void;
  onCloseUpdateProperty: () => void;
  onSaveUpdateProperty: (id: number, value: number, rent: number) => void;
  onCloseAddProperty: () => void;
  onSaveAddProperty: (p: Omit<Property, "id">) => void;
  onCloseAddPropertyTxn: () => void;
  onSavePropertyTxn: (t: Omit<PropertyTransaction, "id">) => void;
};

function InvestmentModals({
  showAddHolding,
  editingHolding,
  addTxnForHolding,
  updatingProperty,
  showAddProperty,
  addTxnForProperty,
  positions,
  mortgageById,
  onCloseEditHolding,
  onSaveHolding,
  onDeleteHolding,
  onCloseAddHoldingTxn,
  onSaveHoldingTxn,
  onCloseUpdateProperty,
  onSaveUpdateProperty,
  onCloseAddProperty,
  onSaveAddProperty,
  onCloseAddPropertyTxn,
  onSavePropertyTxn,
}: InvestmentModalsProps) {
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

      {updatingProperty && (
        <UpdatePropertyModal
          property={updatingProperty}
          mortgageBalance={getPropertyMortgageBalance(updatingProperty, mortgageById)}
          onClose={onCloseUpdateProperty}
          onSave={onSaveUpdateProperty}
        />
      )}

      {showAddProperty && (
        <AddPropertyModal
          onClose={onCloseAddProperty}
          onSave={onSaveAddProperty}
        />
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

type TabSwitcherProps = {
  tab: Tab;
  onSetTab: (tab: Tab) => void;
};

function TabSwitcher({ tab, onSetTab }: TabSwitcherProps) {
  return (
    <div className="flex border-b border-slate-100">
      <button
        onClick={() => onSetTab("brokerage")}
        className={`flex-1 flex items-center justify-center gap-2 py-4 text-sm font-medium transition-colors ${
          tab === "brokerage"
            ? "text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50/40"
            : "text-slate-500 hover:text-slate-700"
        }`}
      >
        <BarChart2 size={16} /> Brokerage Holdings
      </button>
      <button
        onClick={() => onSetTab("property")}
        className={`flex-1 flex items-center justify-center gap-2 py-4 text-sm font-medium transition-colors ${
          tab === "property"
            ? "text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50/40"
            : "text-slate-500 hover:text-slate-700"
        }`}
      >
        <Building2 size={16} /> Property Portfolio
      </button>
    </div>
  );
}

export function Investments() {
  const { fmtBase, convertToBase, isForeign, baseCurrency, fmtNative } = useCurrency();

  const { data: holdings = [], isLoading: loadingHoldings } = useHoldings();
  const { data: holdingTxns = [], isLoading: loadingHoldingTxns } = useHoldingTransactions();
  const { data: properties = [], isLoading: loadingProperties } = useProperties();
  const { data: propertyTxns = [], isLoading: loadingPropertyTxns } = usePropertyTransactions();
  const { data: mortgages = [], isLoading: loadingMortgages } = useMortgages();

  const isLoading =
    loadingHoldings || loadingHoldingTxns || loadingProperties || loadingPropertyTxns || loadingMortgages;

  const createHolding = useCreateHolding();
  const updateHolding = useUpdateHolding();
  const deleteHolding = useDeleteHolding();
  const createHoldingTxn = useCreateHoldingTransaction();
  const deleteHoldingTxn = useDeleteHoldingTransaction();
  const createProperty = useCreateProperty();
  const updatePropertyMut = useUpdateProperty();
  const _deleteProperty = useDeleteProperty();
  const createPropertyTxn = useCreatePropertyTransaction();
  const deletePropertyTxn = useDeletePropertyTransaction();

  const [tab, setTab] = useState<Tab>("brokerage");
  const [editingHolding, setEditingHolding] = useState<Holding | null>(null);
  const [showAddHolding, setShowAddHolding] = useState(false);
  const [addTxnForHolding, setAddTxnForHolding] = useState<Holding | null>(null);
  const [expandedHoldingId, setExpandedHoldingId] = useState<number | null>(null);
  const [updatingProperty, setUpdatingProperty] = useState<Property | null>(null);
  const [showAddProperty, setShowAddProperty] = useState(false);
  const [addTxnForProperty, setAddTxnForProperty] = useState<Property | null>(null);
  const [expandedPropertyId, setExpandedPropertyId] = useState<number | null>(null);

  const mortgageById = useMemo(() => {
    const map = new Map<number, Mortgage>();
    for (const mortgage of mortgages) {
      map.set(mortgage.id, mortgage);
    }
    return map;
  }, [mortgages]);

  const positions = useMemo<Record<number, Position>>(() => {
    const result: Record<number, Position> = {};
    holdings.forEach((holding) => {
      result[holding.id] = computePosition(holding.id, holdingTxns);
    });
    return result;
  }, [holdings, holdingTxns]);

  const totalBrokerageBase = useMemo(
    () =>
      holdings.reduce((sum, holding) => {
        const position = positions[holding.id];
        return sum + convertToBase(position.shares * holding.currentPrice, holding.currency);
      }, 0),
    [holdings, positions, convertToBase],
  );

  const totalCostBase = useMemo(
    () =>
      holdings.reduce((sum, holding) => {
        const position = positions[holding.id];
        return sum + convertToBase(position.shares * position.avgCost, holding.currency);
      }, 0),
    [holdings, positions, convertToBase],
  );

  const totalGainBase = totalBrokerageBase - totalCostBase;
  const gainPct = totalCostBase > 0 ? (totalGainBase / totalCostBase) * 100 : 0;

  const totalDividendsBase = useMemo(
    () =>
      holdings.reduce(
        (sum, holding) => sum + convertToBase(positions[holding.id].totalDividends, holding.currency),
        0,
      ),
    [holdings, positions, convertToBase],
  );

  const totalRealizedBase = useMemo(
    () =>
      holdings.reduce(
        (sum, holding) => sum + convertToBase(positions[holding.id].realizedGain, holding.currency),
        0,
      ),
    [holdings, positions, convertToBase],
  );

  const totalPropertyEquityBase = properties.reduce((sum, property) => {
    const equity = property.currentValue - getPropertyMortgageBalance(property, mortgageById);
    return sum + convertToBase(equity, property.currency);
  }, 0);

  const totalRentalBase = useMemo(
    () => computeTotalRental(propertyTxns, properties, convertToBase),
    [propertyTxns, properties, convertToBase],
  );

  const portfolioHistory = useMemo(
    () => computePortfolioHistory(holdings, holdingTxns, properties, propertyTxns, mortgageById, convertToBase),
    [holdings, holdingTxns, properties, propertyTxns, convertToBase, mortgageById],
  );

  function handleSaveHolding(
    holding: Holding,
    initialBuy?: { shares: number; price: number; date: string },
  ) {
    const existing = holdings.find((entry) => entry.id === holding.id);
    if (existing) {
      updateHolding.mutate(holding);
      return;
    }

    const { id: _id, ...body } = holding;
    createHolding.mutate(body, {
      onSuccess: (created: Holding) => {
        if (!initialBuy) return;
        createHoldingTxn.mutate({
          holdingId: created.id,
          type: "buy",
          shares: initialBuy.shares,
          price: initialBuy.price,
          date: initialBuy.date,
          note: "Initial position",
        });
        setExpandedHoldingId(created.id);
      },
    });
  }

  function handleDeleteHolding(id: number) {
    deleteHolding.mutate(id);
    if (expandedHoldingId === id) setExpandedHoldingId(null);
  }

  function handleAddHoldingTxn(transaction: Omit<HoldingTransaction, "id">) {
    createHoldingTxn.mutate(transaction);
  }

  function handleDeleteHoldingTxn(id: number) {
    deleteHoldingTxn.mutate(id);
  }

  function handleAddPropertyTxn(transaction: Omit<PropertyTransaction, "id">) {
    createPropertyTxn.mutate(transaction);
  }

  function handleDeletePropertyTxn(id: number) {
    deletePropertyTxn.mutate(id);
  }

  function handleUpdateProperty(id: number, value: number, rent: number) {
    const existing = properties.find((property) => property.id === id);
    if (existing) {
      updatePropertyMut.mutate({
        ...existing,
        currentValue: value,
        monthlyRent: rent,
      });
    }
  }

  function handleSaveProperty(property: Omit<Property, "id">) {
    createProperty.mutate(property);
    setShowAddProperty(false);
  }

  if (isLoading) {
    return <LoadingSpinner />;
  }

  return (
    <div className="p-6 space-y-6">
      <InvestmentModals
        showAddHolding={showAddHolding}
        editingHolding={editingHolding}
        addTxnForHolding={addTxnForHolding}
        updatingProperty={updatingProperty}
        showAddProperty={showAddProperty}
        addTxnForProperty={addTxnForProperty}
        positions={positions}
        mortgageById={mortgageById}
        onCloseEditHolding={() => { setShowAddHolding(false); setEditingHolding(null); }}
        onSaveHolding={handleSaveHolding}
        onDeleteHolding={handleDeleteHolding}
        onCloseAddHoldingTxn={() => setAddTxnForHolding(null)}
        onSaveHoldingTxn={handleAddHoldingTxn}
        onCloseUpdateProperty={() => setUpdatingProperty(null)}
        onSaveUpdateProperty={handleUpdateProperty}
        onCloseAddProperty={() => setShowAddProperty(false)}
        onSaveAddProperty={handleSaveProperty}
        onCloseAddPropertyTxn={() => setAddTxnForProperty(null)}
        onSavePropertyTxn={handleAddPropertyTxn}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Brokerage Value"
          value={fmtBase(totalBrokerageBase)}
          subtitle={`${gainPct >= 0 ? "+" : ""}${gainPct.toFixed(1)}% unrealized`}
          icon={BarChart2}
          color="indigo"
          change={{ value: `${gainPct >= 0 ? "+" : ""}${gainPct.toFixed(1)}%`, positive: gainPct >= 0 }}
        />
        <StatCard
          label="Unrealized Gain"
          value={`${totalGainBase >= 0 ? "+" : ""}${fmtBase(Math.abs(totalGainBase))}`}
          subtitle={`Cost basis ${fmtBase(totalCostBase)}`}
          icon={TrendingUp}
          color="emerald"
          change={{ value: `${totalGainBase >= 0 ? "+" : ""}${fmtBase(Math.abs(totalGainBase), undefined, true)}`, positive: totalGainBase >= 0 }}
        />
        <StatCard
          label="Dividends Received"
          value={`+${fmtBase(totalDividendsBase)}`}
          subtitle={`${totalRealizedBase >= 0 ? "+" : ""}${fmtBase(totalRealizedBase)} realized`}
          icon={DollarSign}
          color="sky"
          change={{ value: `${totalRealizedBase >= 0 ? "+" : ""}${fmtBase(Math.abs(totalRealizedBase), undefined, true)}`, positive: totalRealizedBase >= 0 }}
        />
        <StatCard
          label="Property Equity"
          value={fmtBase(totalPropertyEquityBase)}
          subtitle={`${fmtBase(totalRentalBase)}/mo rental`}
          icon={Building2}
          color="amber"
          change={{ value: `${fmtBase(totalRentalBase, undefined, true)}/mo`, positive: totalRentalBase >= 0 }}
        />
      </div>

      <PortfolioChart data={portfolioHistory} baseCurrency={baseCurrency} fmtBase={fmtBase} />

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <TabSwitcher tab={tab} onSetTab={setTab} />

        {tab === "brokerage" && (
          <BrokerageTab
            holdings={holdings}
            holdingTxns={holdingTxns}
            positions={positions}
            baseCurrency={baseCurrency}
            totalDividendsBase={totalDividendsBase}
            totalRealizedBase={totalRealizedBase}
            totalBrokerageBase={totalBrokerageBase}
            totalGainBase={totalGainBase}
            gainPct={gainPct}
            expandedHoldingId={expandedHoldingId}
            fmtBase={fmtBase}
            fmtNative={fmtNative}
            convertToBase={convertToBase}
            isForeign={isForeign}
            onAddHolding={() => {
              setEditingHolding(null);
              setShowAddHolding(true);
            }}
            onEditHolding={setEditingHolding}
            onToggleExpanded={(id) => setExpandedHoldingId(expandedHoldingId === id ? null : id)}
            onAddTxnForHolding={setAddTxnForHolding}
            onDeleteTxn={handleDeleteHoldingTxn}
          />
        )}

        {tab === "property" && (
          <PropertyTab
            properties={properties}
            propertyTxns={propertyTxns}
            mortgageById={mortgageById}
            expandedPropertyId={expandedPropertyId}
            fmtNative={fmtNative}
            onAddProperty={() => setShowAddProperty(true)}
            onUpdateProperty={setUpdatingProperty}
            onToggleExpanded={(id) => setExpandedPropertyId(expandedPropertyId === id ? null : id)}
            onAddTxnForProperty={setAddTxnForProperty}
            onDeleteTxn={handleDeletePropertyTxn}
          />
        )}
      </div>
    </div>
  );
}
