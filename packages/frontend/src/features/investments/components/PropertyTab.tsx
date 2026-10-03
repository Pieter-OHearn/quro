import { Building2, ChevronDown, ChevronUp, Edit3, ExternalLink, Home, Plus } from 'lucide-react';
import { Link } from 'react-router';
import { EmptyState } from '@/components/ui';
import { JointBadge } from '@/features/partner';
import {
  formatPercent,
  type Mortgage,
  type Property,
  type PropertyTransaction,
} from '@quro/shared';
import { getPropertyMortgageBalance, getPropertyOwnershipShare } from '../utils/position';
import { PropertiesArchivedSection } from './PropertiesArchivedSection';
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
  totalEquity: number;
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
  const totalEquity = property.currentValue - mortgageBalance;
  const equity = totalEquity * getPropertyOwnershipShare(property);
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
    totalEquity,
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

function getEquityLabel(isJoint: boolean, hasMortgage: boolean): string {
  if (isJoint) return hasMortgage ? 'Your Equity (50%)' : 'Your Asset Value (50%)';
  return hasMortgage ? 'Equity' : 'Asset Value (no mortgage)';
}

function PropertyValueGrid({ property, linkedMortgage, stats, fmtNative }: PropertyValueGridProps) {
  const ownershipShare = getPropertyOwnershipShare(property);
  const isJoint = ownershipShare < 1;
  const equityLabel = getEquityLabel(isJoint, linkedMortgage !== undefined);

  return (
    <div className="grid grid-cols-2 gap-3 mb-3">
      <div className="bg-surface-sunken rounded-xl p-3">
        <p className="text-[10px] text-fg-faint mb-0.5">
          {isJoint ? 'Property Value (total)' : 'Current Value'}
        </p>
        <p className="font-bold text-fg text-sm">
          {fmtNative(property.currentValue, property.currency, true)}
        </p>
        <p
          className={`text-[10px] mt-0.5 font-medium ${stats.appreciation >= 0 ? 'text-success' : 'text-danger'}`}
        >
          {stats.appreciation >= 0 ? '+' : ''}
          {fmtNative(stats.appreciation, property.currency, true)} (
          {stats.appreciationPct >= 0 ? '+' : ''}
          {formatPercent(stats.appreciationPct, 1)})
        </p>
      </div>
      <div className="bg-surface-sunken rounded-xl p-3">
        <p className="text-[10px] text-fg-faint mb-0.5">{equityLabel}</p>
        <p className="font-bold text-success text-sm">
          {fmtNative(stats.equity, property.currency, true)}
        </p>
        {isJoint && (
          <p className="text-[10px] text-fg-faint mt-0.5">
            {fmtNative(stats.totalEquity, property.currency, true)} total equity
          </p>
        )}
        {linkedMortgage && (
          <p className="text-[10px] text-fg-faint mt-0.5">
            LTV{' '}
            <span
              className={
                stats.ltv < HEALTHY_LTV_THRESHOLD
                  ? 'text-success font-medium'
                  : 'text-warning font-medium'
              }
            >
              {formatPercent(stats.ltv, 1)}
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

function MortgageLinkRow({ property, linkedMortgage, fmtNative }: MortgageLinkRowProps) {
  if (linkedMortgage) {
    return (
      <div className="flex items-center justify-between bg-surface-sunken border border-border-subtle rounded-xl px-3 py-2.5 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-6 h-6 rounded-lg bg-brand-soft-strong flex items-center justify-center flex-shrink-0">
            <Building2 size={11} className="text-brand" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] text-fg-faint">
              {property.isJoint ? 'Joint mortgage' : 'Linked mortgage'} · {linkedMortgage.lender}
            </p>
            <p className="text-xs font-semibold text-fg-emphasis truncate">
              {fmtNative(linkedMortgage.outstandingBalance, linkedMortgage.currency, true)}{' '}
              {property.isJoint ? 'total outstanding' : 'outstanding'} ·{' '}
              {formatPercent(linkedMortgage.interestRate, 2)}
            </p>
          </div>
        </div>
        <Link
          to="/mortgage"
          className="flex items-center gap-1 text-[10px] font-semibold text-brand hover:text-brand-strong transition-colors flex-shrink-0"
        >
          View <ExternalLink size={10} />
        </Link>
      </div>
    );
  }
  return (
    <Link
      to="/mortgage"
      className="flex items-center justify-between bg-surface-sunken border border-dashed border-border-default rounded-xl px-3 py-2.5 mb-3 hover:border-brand-border hover:bg-brand-soft/40 transition-all group"
    >
      <div className="flex items-center gap-2 min-w-0">
        <div className="w-6 h-6 rounded-lg bg-border-default flex items-center justify-center flex-shrink-0">
          <Building2 size={11} className="text-fg-faint" />
        </div>
        <p className="text-xs text-fg-faint truncate">
          No mortgage linked — add one on the Mortgage page
        </p>
      </div>
      <ExternalLink
        size={11}
        className="text-fg-disabled group-hover:text-brand-accent transition-colors flex-shrink-0"
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
        <div className="text-center bg-brand-soft rounded-xl p-2.5">
          <p className="text-[9px] text-brand-accent font-medium uppercase tracking-wide mb-0.5">
            Gross Rent
          </p>
          <p className="text-xs font-bold text-brand-fg">
            +{fmtNative(totalRent, property.currency, true)}
          </p>
        </div>
        <div className="text-center bg-danger-soft rounded-xl p-2.5">
          <p className="text-[9px] text-danger font-medium uppercase tracking-wide mb-0.5">
            Expenses
          </p>
          <p className="text-xs font-bold text-danger-hover">
            -{fmtNative(totalExpenses, property.currency, true)}
          </p>
        </div>
        <div
          className={`text-center rounded-xl p-2.5 ${netDisplay >= 0 ? 'bg-success-soft' : 'bg-danger-soft'}`}
        >
          <p
            className={`text-[9px] font-medium uppercase tracking-wide mb-0.5 ${netDisplay >= 0 ? 'text-success' : 'text-danger'}`}
          >
            Net Income
          </p>
          <p
            className={`text-xs font-bold ${netDisplay >= 0 ? 'text-success-fg' : 'text-danger-hover'}`}
          >
            {netDisplay >= 0 ? '+' : '-'}
            {fmtNative(Math.abs(netDisplay), property.currency, true)}
          </p>
        </div>
      </div>
      {grossYield > 0 && <PropertyYieldBadges grossYield={grossYield} netYield={netYield} />}
    </>
  );
}

type PropertyYieldBadgesProps = {
  grossYield: number;
  netYield: number;
};

function PropertyYieldBadges({ grossYield, netYield }: PropertyYieldBadgesProps) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-[10px] bg-brand-soft text-brand-fg px-2.5 py-1 rounded-full font-semibold">
        Gross yield {formatPercent(grossYield, 2)}
      </span>
      <span
        className={`text-[10px] px-2.5 py-1 rounded-full font-semibold ${netYield >= 0 ? 'bg-success-soft text-success-fg' : 'bg-danger-soft text-danger-hover'}`}
      >
        Net yield {formatPercent(netYield, 2)}
      </span>
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
          <p className="font-semibold text-fg truncate">{property.address}</p>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <JointBadge isJoint={property.isJoint} ownerUserId={property.userId} size="xs" />
            <span className="text-[10px] bg-surface-muted text-fg-muted px-2 py-0.5 rounded-full font-medium">
              {property.propertyType}
            </span>
            <span className="text-[10px] bg-brand-soft text-brand px-2 py-0.5 rounded-full font-medium">
              {property.currency}
            </span>
            {!linkedMortgage && (
              <span className="text-[10px] bg-success-soft text-success px-2 py-0.5 rounded-full font-medium">
                Unencumbered
              </span>
            )}
          </div>
          <p className="text-[11px] text-fg-faint mt-1">{txnCount} transactions</p>
        </div>
      </div>
      <div className="flex items-center gap-1 flex-shrink-0">
        <button
          onClick={() => onUpdateProperty(property)}
          className="p-1.5 rounded-lg hover:bg-surface-muted text-fg-faint hover:text-fg-muted transition-colors"
          title="Edit property"
        >
          <Edit3 size={14} />
        </button>
        <button
          onClick={() => onToggleExpanded(property.id)}
          className="p-1.5 rounded-lg hover:bg-surface-muted text-fg-faint hover:text-fg-muted transition-colors"
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
      className={`border border-border-subtle rounded-2xl overflow-hidden transition-shadow hover:shadow-md ${isExpanded ? 'shadow-md' : ''}`}
    >
      <div className="p-5 bg-surface">
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
          <PropertyYieldBadges grossYield={stats.grossYield} netYield={stats.netYield} />
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
        <p className="text-xs text-fg-faint">
          {properties.length} {properties.length === 1 ? 'property' : 'properties'} · click a card
          to view transactions
        </p>
        <button
          onClick={onAddProperty}
          className="flex items-center gap-2 text-sm bg-brand hover:bg-brand-hover text-fg-inverted px-4 py-2 rounded-xl transition-colors"
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
      <div className="px-6 pb-6">
        <PropertiesArchivedSection />
      </div>
    </div>
  );
}
