import { Building2, ChevronDown, ChevronUp, Edit3, ExternalLink, Home, Plus } from 'lucide-react';
import { Link } from 'react-router';
import { EmptyState } from '@/components/ui';
import type { Mortgage, Property, PropertyTransaction } from '@quro/shared';
import { getPropertyMortgageBalance } from '../utils/position';
import { PropertyTxnHistory } from './PropertyTxnHistory';

type PropertyTabProps = {
  properties: Property[];
  propertyTxns: PropertyTransaction[];
  mortgageById: Map<number, Mortgage>;
  expandedPropertyId: number | null;
  fmtNative: (value: number, currency: string, compact?: boolean) => string;
  onAddProperty: () => void;
  onUpdateProperty: (property: Property) => void;
  onToggleExpanded: (id: number) => void;
  onAddTxnForProperty: (property: Property) => void;
  onEditTxn: (transaction: PropertyTransaction) => void;
  onDeleteTxn: (id: number) => void;
};

type PropertyCardStats = {
  equity: number;
  appreciation: number;
  appreciationPct: number;
  ltv: number;
  mortgageBalance: number;
  totalRent: number;
  totalExpenses: number;
  netDisplay: number;
  grossYield: number;
  netYield: number;
  txnCount: number;
  hasPL: boolean;
};

const HEALTHY_LTV_THRESHOLD = 70;

function computePropertyCardStats(
  property: Property,
  propertyTxns: PropertyTransaction[],
  mortgageById: Map<number, Mortgage>,
): PropertyCardStats {
  const mortgageBalance = getPropertyMortgageBalance(property, mortgageById);
  const equity = property.currentValue - mortgageBalance;
  const appreciation = property.currentValue - property.purchasePrice;
  const appreciationPct = (property.currentValue / property.purchasePrice - 1) * 100;
  const ltv =
    mortgageBalance > 0 && property.currentValue > 0
      ? (mortgageBalance / property.currentValue) * 100
      : 0;

  const propertyTransactions = propertyTxns.filter((t) => t.propertyId === property.id);
  const txnCount = propertyTransactions.length;
  const totalRent = propertyTransactions
    .filter((t) => t.type === 'rent_income')
    .reduce((sum, t) => sum + t.amount, 0);
  const totalExpenses = propertyTransactions
    .filter((t) => t.type === 'expense')
    .reduce((sum, t) => sum + t.amount, 0);
  const netDisplay = totalRent - totalExpenses;
  const rentMonths = propertyTransactions.filter((t) => t.type === 'rent_income').length;
  const annualRent = rentMonths > 0 ? (totalRent / rentMonths) * 12 : 0;
  const annualNOI = rentMonths > 0 ? (netDisplay / rentMonths) * 12 : 0;
  const grossYield = property.currentValue > 0 ? (annualRent / property.currentValue) * 100 : 0;
  const netYield = property.currentValue > 0 ? (annualNOI / property.currentValue) * 100 : 0;
  const hasPL = totalRent > 0 || totalExpenses > 0;

  return {
    equity,
    appreciation,
    appreciationPct,
    ltv,
    mortgageBalance,
    totalRent,
    totalExpenses,
    netDisplay,
    grossYield,
    netYield,
    txnCount,
    hasPL,
  };
}

type PropertyValueGridProps = {
  property: Property;
  linkedMortgage: Mortgage | undefined;
  stats: PropertyCardStats;
  fmtNative: (value: number, currency: string, compact?: boolean) => string;
};

function PropertyValueGrid({ property, linkedMortgage, stats, fmtNative }: PropertyValueGridProps) {
  return (
    <div className="grid grid-cols-2 gap-3 mb-3">
      <div className="bg-slate-50 rounded-xl p-3">
        <p className="text-[10px] text-slate-400 mb-0.5">Current Value</p>
        <p className="font-bold text-slate-900 text-sm">
          {fmtNative(property.currentValue, property.currency, true)}
        </p>
        <p
          className={`text-[10px] mt-0.5 font-medium ${stats.appreciation >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}
        >
          {stats.appreciation >= 0 ? '+' : ''}
          {fmtNative(stats.appreciation, property.currency, true)} (
          {stats.appreciationPct >= 0 ? '+' : ''}
          {stats.appreciationPct.toFixed(1)}%)
        </p>
      </div>
      <div className="bg-slate-50 rounded-xl p-3">
        <p className="text-[10px] text-slate-400 mb-0.5">
          {linkedMortgage ? 'Equity' : 'Asset Value (no mortgage)'}
        </p>
        <p className="font-bold text-emerald-600 text-sm">
          {fmtNative(stats.equity, property.currency, true)}
        </p>
        {linkedMortgage && (
          <p className="text-[10px] text-slate-400 mt-0.5">
            LTV{' '}
            <span
              className={
                stats.ltv < HEALTHY_LTV_THRESHOLD
                  ? 'text-emerald-600 font-medium'
                  : 'text-amber-600 font-medium'
              }
            >
              {stats.ltv.toFixed(1)}%
            </span>
          </p>
        )}
      </div>
    </div>
  );
}

type MortgageLinkRowProps = {
  property: Property;
  linkedMortgage: Mortgage | undefined;
  fmtNative: (value: number, currency: string, compact?: boolean) => string;
};

function MortgageLinkRow({ property: _property, linkedMortgage, fmtNative }: MortgageLinkRowProps) {
  if (linkedMortgage) {
    return (
      <div className="flex items-center justify-between bg-slate-50 border border-slate-100 rounded-xl px-3 py-2.5 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-6 h-6 rounded-lg bg-indigo-100 flex items-center justify-center flex-shrink-0">
            <Building2 size={11} className="text-indigo-600" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] text-slate-400">Linked mortgage · {linkedMortgage.lender}</p>
            <p className="text-xs font-semibold text-slate-800 truncate">
              {fmtNative(linkedMortgage.outstandingBalance, linkedMortgage.currency, true)}{' '}
              outstanding · {linkedMortgage.interestRate.toFixed(2)}%
            </p>
          </div>
        </div>
        <Link
          to="/mortgage"
          className="flex items-center gap-1 text-[10px] font-semibold text-indigo-600 hover:text-indigo-800 transition-colors flex-shrink-0"
        >
          View <ExternalLink size={10} />
        </Link>
      </div>
    );
  }
  return (
    <Link
      to="/mortgage"
      className="flex items-center justify-between bg-slate-50 border border-dashed border-slate-200 rounded-xl px-3 py-2.5 mb-3 hover:border-indigo-300 hover:bg-indigo-50/40 transition-all group"
    >
      <div className="flex items-center gap-2 min-w-0">
        <div className="w-6 h-6 rounded-lg bg-slate-200 flex items-center justify-center flex-shrink-0">
          <Building2 size={11} className="text-slate-400" />
        </div>
        <p className="text-xs text-slate-400 truncate">
          No mortgage linked — add one on the Mortgage page
        </p>
      </div>
      <ExternalLink
        size={11}
        className="text-slate-300 group-hover:text-indigo-500 transition-colors flex-shrink-0"
      />
    </Link>
  );
}

type PropertyPLGridProps = {
  property: Property;
  stats: PropertyCardStats;
  fmtNative: (value: number, currency: string, compact?: boolean) => string;
};

function PropertyPLGrid({ property, stats, fmtNative }: PropertyPLGridProps) {
  const { totalRent, totalExpenses, netDisplay, grossYield, netYield } = stats;
  return (
    <>
      <div className="grid grid-cols-3 gap-2 mb-3">
        <div className="text-center bg-indigo-50 rounded-xl p-2.5">
          <p className="text-[9px] text-indigo-500 font-medium uppercase tracking-wide mb-0.5">
            Gross Rent
          </p>
          <p className="text-xs font-bold text-indigo-700">
            +{fmtNative(totalRent, property.currency, true)}
          </p>
        </div>
        <div className="text-center bg-rose-50 rounded-xl p-2.5">
          <p className="text-[9px] text-rose-500 font-medium uppercase tracking-wide mb-0.5">
            Expenses
          </p>
          <p className="text-xs font-bold text-rose-600">
            -{fmtNative(totalExpenses, property.currency, true)}
          </p>
        </div>
        <div
          className={`text-center rounded-xl p-2.5 ${netDisplay >= 0 ? 'bg-emerald-50' : 'bg-rose-50'}`}
        >
          <p
            className={`text-[9px] font-medium uppercase tracking-wide mb-0.5 ${netDisplay >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}
          >
            Net Income
          </p>
          <p
            className={`text-xs font-bold ${netDisplay >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}
          >
            {netDisplay >= 0 ? '+' : '-'}
            {fmtNative(Math.abs(netDisplay), property.currency, true)}
          </p>
        </div>
      </div>
      {grossYield > 0 && (
        <PropertyYieldBadges property={property} grossYield={grossYield} netYield={netYield} />
      )}
    </>
  );
}

type PropertyYieldBadgesProps = {
  property: Property;
  grossYield: number;
  netYield: number;
};

function PropertyYieldBadges({
  property: _property,
  grossYield,
  netYield,
}: PropertyYieldBadgesProps) {
  const linkedMortgage = undefined as Mortgage | undefined;
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-[10px] bg-indigo-50 text-indigo-700 px-2.5 py-1 rounded-full font-semibold">
        Gross yield {grossYield.toFixed(2)}%
      </span>
      <span
        className={`text-[10px] px-2.5 py-1 rounded-full font-semibold ${netYield >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-600'}`}
      >
        Net yield {netYield.toFixed(2)}%
      </span>
      {linkedMortgage && (
        <span className="text-[10px] bg-amber-50 text-amber-700 px-2.5 py-1 rounded-full font-semibold">
          {(linkedMortgage as Mortgage).interestRate.toFixed(2)}% mortgage rate
        </span>
      )}
    </div>
  );
}

type PropertyCardProps = {
  property: Property;
  propertyTxns: PropertyTransaction[];
  mortgageById: Map<number, Mortgage>;
  isExpanded: boolean;
  fmtNative: (value: number, currency: string, compact?: boolean) => string;
  onUpdateProperty: (property: Property) => void;
  onToggleExpanded: (id: number) => void;
  onAddTxnForProperty: (property: Property) => void;
  onEditTxn: (transaction: PropertyTransaction) => void;
  onDeleteTxn: (id: number) => void;
};

type PropertyCardHeaderProps = {
  property: Property;
  linkedMortgage: Mortgage | undefined;
  isExpanded: boolean;
  txnCount: number;
  onUpdateProperty: (property: Property) => void;
  onToggleExpanded: (id: number) => void;
};

function PropertyCardHeader({
  property,
  linkedMortgage,
  isExpanded,
  txnCount,
  onUpdateProperty,
  onToggleExpanded,
}: PropertyCardHeaderProps) {
  return (
    <div className="flex items-start justify-between gap-3 mb-4">
      <div className="flex items-center gap-3 min-w-0">
        <span className="text-2xl leading-none flex-shrink-0">{property.emoji}</span>
        <div className="min-w-0">
          <p className="font-semibold text-slate-900 truncate">{property.address}</p>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-medium">
              {property.propertyType}
            </span>
            <span className="text-[10px] bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full font-medium">
              {property.currency}
            </span>
            {!linkedMortgage && (
              <span className="text-[10px] bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded-full font-medium">
                Unencumbered
              </span>
            )}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">{txnCount} transactions</p>
        </div>
      </div>
      <div className="flex items-center gap-1 flex-shrink-0">
        <button
          onClick={() => onUpdateProperty(property)}
          className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
          title="Edit property"
        >
          <Edit3 size={14} />
        </button>
        <button
          onClick={() => onToggleExpanded(property.id)}
          className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
          title={isExpanded ? 'Collapse' : 'View transactions'}
        >
          {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      </div>
    </div>
  );
}

function PropertyCard(props: PropertyCardProps) {
  const { property, propertyTxns, mortgageById, isExpanded, fmtNative } = props;
  const { onUpdateProperty, onToggleExpanded, onAddTxnForProperty, onEditTxn, onDeleteTxn } = props;
  const linkedMortgage =
    property.mortgageId != null ? mortgageById.get(property.mortgageId) : undefined;
  const stats = computePropertyCardStats(property, propertyTxns, mortgageById);

  return (
    <div
      className={`border border-slate-100 rounded-2xl overflow-hidden transition-shadow hover:shadow-md ${isExpanded ? 'shadow-md' : ''}`}
    >
      <div className="p-5 bg-white">
        <PropertyCardHeader
          property={property}
          linkedMortgage={linkedMortgage}
          isExpanded={isExpanded}
          txnCount={stats.txnCount}
          onUpdateProperty={onUpdateProperty}
          onToggleExpanded={onToggleExpanded}
        />
        <PropertyValueGrid
          property={property}
          linkedMortgage={linkedMortgage}
          stats={stats}
          fmtNative={fmtNative}
        />
        <MortgageLinkRow
          property={property}
          linkedMortgage={linkedMortgage}
          fmtNative={fmtNative}
        />
        {stats.hasPL && <PropertyPLGrid property={property} stats={stats} fmtNative={fmtNative} />}
        {stats.grossYield > 0 && !stats.hasPL && (
          <PropertyYieldBadges
            property={property}
            grossYield={stats.grossYield}
            netYield={stats.netYield}
          />
        )}
      </div>
      {isExpanded && (
        <PropertyTxnHistory
          property={property}
          transactions={propertyTxns.filter((t) => t.propertyId === property.id)}
          onAdd={() => onAddTxnForProperty(property)}
          onEdit={onEditTxn}
          onDelete={onDeleteTxn}
        />
      )}
    </div>
  );
}

type PropertyCardsListProps = Omit<PropertyTabProps, 'onAddProperty'> & {
  expandedPropertyId: number | null;
};

function PropertyCardsList({
  properties,
  propertyTxns,
  mortgageById,
  expandedPropertyId,
  fmtNative,
  onUpdateProperty,
  onToggleExpanded,
  onAddTxnForProperty,
  onEditTxn,
  onDeleteTxn,
}: PropertyCardsListProps) {
  return (
    <div className="p-6 pt-0 space-y-4">
      {properties.map((property) => (
        <PropertyCard
          key={property.id}
          property={property}
          propertyTxns={propertyTxns}
          mortgageById={mortgageById}
          isExpanded={expandedPropertyId === property.id}
          fmtNative={fmtNative}
          onUpdateProperty={onUpdateProperty}
          onToggleExpanded={onToggleExpanded}
          onAddTxnForProperty={onAddTxnForProperty}
          onEditTxn={onEditTxn}
          onDeleteTxn={onDeleteTxn}
        />
      ))}
    </div>
  );
}

export function PropertyTab({
  properties,
  propertyTxns,
  mortgageById,
  expandedPropertyId,
  fmtNative,
  onAddProperty,
  onUpdateProperty,
  onToggleExpanded,
  onAddTxnForProperty,
  onEditTxn,
  onDeleteTxn,
}: PropertyTabProps) {
  return (
    <div>
      <div className="px-6 pt-5 pb-3 flex items-center justify-between">
        <p className="text-xs text-slate-400">
          {properties.length} {properties.length === 1 ? 'property' : 'properties'} · click a card
          to view transactions
        </p>
        <button
          onClick={onAddProperty}
          className="flex items-center gap-2 text-sm bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl transition-colors"
        >
          <Plus size={15} /> Add Property
        </button>
      </div>
      {properties.length === 0 ? (
        <EmptyState
          icon={Home}
          title="No properties yet"
          description="Add your first property to track its value, rental income, expenses and link it to a mortgage."
          action={{ label: 'Add Property', onClick: onAddProperty }}
        />
      ) : (
        <PropertyCardsList
          properties={properties}
          propertyTxns={propertyTxns}
          mortgageById={mortgageById}
          expandedPropertyId={expandedPropertyId}
          fmtNative={fmtNative}
          onUpdateProperty={onUpdateProperty}
          onToggleExpanded={onToggleExpanded}
          onAddTxnForProperty={onAddTxnForProperty}
          onEditTxn={onEditTxn}
          onDeleteTxn={onDeleteTxn}
        />
      )}
    </div>
  );
}
