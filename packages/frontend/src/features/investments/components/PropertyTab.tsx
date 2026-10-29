import { displayLabel } from '@/lib/displayLabels';
import { Building2, ChevronDown, ChevronUp, Edit3, ExternalLink, Home, Plus } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';
import { useCurrency } from '@/lib/CurrencyContext';
import { Link } from 'react-router';
import { Badge, Button, Card, Change, EmptyState, IconButton, RowActions } from '@/components/ui';
import { TxnAmount } from '@/components/finance/TxnAmount';
import { cn } from '@/lib/utils';
import { JointBadge } from '@/features/partner';
import {
  formatPercent,
  type Mortgage,
  type MortgageTransaction,
  type Property,
  type PropertyTransaction,
} from '@quro/shared';
import { getPropertyOwnershipShare } from '../utils/position';
import { PropertiesArchivedSection } from './PropertiesArchivedSection';
import { PropertyTxnHistory } from './PropertyTxnHistory';

type PropertyTabProps = {
  properties: Property[];
  propertyTxns: PropertyTransaction[];
  mortgageById: Map<number, Mortgage>;
  /** Every mortgage ledger: a card lists its linked mortgage's rows read-only. */
  mortgageTxns: MortgageTransaction[];
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

// Debt and equity are the server's: the figures the mortgage page and the dashboard read.
function computePropertyCardStats(
  property: Property,
  propertyTransactions: PropertyTransaction[],
  linkedMortgageTxns: MortgageTransaction[],
): PropertyCardStats {
  const mortgageBalance = property.debt;
  const { totalEquity, equity } = property;
  const appreciation = property.currentValue - property.purchasePrice;
  const appreciationPct = (property.currentValue / property.purchasePrice - 1) * 100;
  const ltv =
    mortgageBalance > 0 && property.currentValue > 0
      ? (mortgageBalance / property.currentValue) * 100
      : 0;

  const txnCount = propertyTransactions.length + linkedMortgageTxns.length;
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
  if (isJoint) return hasMortgage ? 'Your equity (50%)' : 'Your asset value (50%)';
  return hasMortgage ? 'Equity' : 'Asset value (no mortgage)';
}

function PropertyFigure({
  label,
  figure,
  children,
}: Readonly<{ label: string; figure: ReactNode; children?: ReactNode }>) {
  return (
    <div className="min-w-0">
      <p className="text-label text-fg-muted">{label}</p>
      <p className="text-figure-md text-fg">{figure}</p>
      {children ? <div className="text-caption text-fg-subtle">{children}</div> : null}
    </div>
  );
}

function PropertyValueGrid({ property, linkedMortgage, stats, fmtNative }: PropertyValueGridProps) {
  const { numberFormat } = useCurrency();
  const ownershipShare = getPropertyOwnershipShare(property);
  const isJoint = ownershipShare < 1;
  const equityLabel = getEquityLabel(isJoint, linkedMortgage !== undefined);

  return (
    <div className="grid grid-cols-2 gap-4">
      <PropertyFigure
        label={isJoint ? 'Property value (total)' : 'Current value'}
        figure={fmtNative(property.currentValue, property.currency, true)}
      >
        <span className="inline-flex flex-wrap gap-x-1.5">
          <Change value={stats.appreciation} format="amount" currency={property.currency} />
          <Change value={stats.appreciationPct} format="percent" />
        </span>
      </PropertyFigure>
      <PropertyFigure label={equityLabel} figure={fmtNative(stats.equity, property.currency, true)}>
        {isJoint && (
          <p>
            <span className="font-numeric">
              {fmtNative(stats.totalEquity, property.currency, true)}
            </span>{' '}
            total equity
          </p>
        )}
        {linkedMortgage && (
          <p>
            LTV{' '}
            <span
              className={cn(
                'font-numeric font-medium',
                stats.ltv < HEALTHY_LTV_THRESHOLD ? 'text-fg' : 'text-warning',
              )}
            >
              {formatPercent(stats.ltv, numberFormat, 1)}
            </span>
          </p>
        )}
      </PropertyFigure>
    </div>
  );
}

type MortgageLinkRowProps = {
  property: Property;
  linkedMortgage: Mortgage | undefined;
  fmtNative: (value: number, currency: string, compact?: boolean) => string;
};

const LINK_ROW_CLASS_NAME =
  'flex min-h-9 items-center justify-between gap-3 rounded-md border px-3 py-1.5 max-sm:min-h-11';

function MortgageLinkRow({ property, linkedMortgage, fmtNative }: MortgageLinkRowProps) {
  const { numberFormat } = useCurrency();
  if (linkedMortgage) {
    return (
      <div className={cn(LINK_ROW_CLASS_NAME, 'border-border-subtle')}>
        <div className="flex min-w-0 items-center gap-2">
          <Building2 size={14} className="shrink-0 text-fg-faint" aria-hidden />
          <div className="min-w-0">
            <p className="text-caption text-fg-subtle">
              {property.isJoint ? 'Joint mortgage' : 'Linked mortgage'} · {linkedMortgage.lender}
            </p>
            <p className="truncate text-cell text-fg">
              <span className="font-numeric">
                {fmtNative(linkedMortgage.outstandingBalance, linkedMortgage.currency, true)}
              </span>{' '}
              {property.isJoint ? 'total outstanding' : 'outstanding'} ·{' '}
              <span className="font-numeric">
                {formatPercent(linkedMortgage.interestRate, numberFormat, 2)}
              </span>
            </p>
          </div>
        </div>
        <Link
          to="/mortgage"
          className="flex shrink-0 items-center justify-center gap-1 rounded-sm text-label text-brand hover:underline max-sm:min-h-11 max-sm:min-w-11 active:underline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus-ring"
        >
          View <ExternalLink size={12} aria-hidden />
        </Link>
      </div>
    );
  }
  return (
    <Link
      to="/mortgage"
      className={cn(
        LINK_ROW_CLASS_NAME,
        'group border-dashed border-border-default transition-colors duration-fast hover:bg-surface-muted active:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus-ring',
      )}
    >
      <span className="flex min-w-0 items-center gap-2">
        <Building2 size={14} className="shrink-0 text-fg-faint" aria-hidden />
        <span className="truncate text-cell text-fg-muted">
          No mortgage linked — add one on the Mortgage page
        </span>
      </span>
      <ExternalLink size={12} className="shrink-0 text-fg-faint" aria-hidden />
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
  const format = (amount: number) => fmtNative(amount, property.currency, true);
  return (
    <>
      <div className="grid grid-cols-3 gap-4">
        <PropertyFigure
          label="Gross rent"
          figure={<TxnAmount value={totalRent} format={format} />}
        />
        <PropertyFigure
          label="Expenses"
          figure={<TxnAmount value={-totalExpenses} format={format} />}
        />
        <PropertyFigure
          label="Net income"
          figure={<TxnAmount value={netDisplay} format={format} />}
        />
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
  const { numberFormat } = useCurrency();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge className="font-numeric">
        Gross yield {formatPercent(grossYield, numberFormat, 2)}
      </Badge>
      <Badge className="font-numeric">Net yield {formatPercent(netYield, numberFormat, 2)}</Badge>
    </div>
  );
}

type PropertyCardProps = {
  property: Property;
  propertyTxns: PropertyTransaction[];
  mortgageById: Map<number, Mortgage>;
  mortgageTxns: MortgageTransaction[];
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
  const toggleLabel = isExpanded ? 'Collapse' : 'View transactions';
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3">
      <div className="flex min-w-0 items-start gap-2">
        <span className="shrink-0 text-title-section leading-5" aria-hidden>
          {property.emoji}
        </span>
        <p
          title={property.address}
          className="line-clamp-2 min-w-0 break-words text-title-section text-fg sm:line-clamp-1"
        >
          {property.address}
        </p>
      </div>
      <RowActions className="shrink-0 sm:row-span-2">
        <IconButton
          onClick={() => onUpdateProperty(property)}
          icon={Edit3}
          label="Edit property"
          title="Edit property"
          size="sm"
          variant="subtle"
        />
        <IconButton
          onClick={() => onToggleExpanded(property.id)}
          icon={isExpanded ? ChevronUp : ChevronDown}
          label={toggleLabel}
          title={toggleLabel}
          aria-expanded={isExpanded}
          size="sm"
          variant="subtle"
        />
      </RowActions>
      <div className="col-span-2 mt-1 flex flex-wrap items-center gap-x-1 gap-y-1 pl-7 sm:col-span-1 [&_*]:whitespace-nowrap">
        <JointBadge isJoint={property.isJoint} ownerUserId={property.userId} size="xs" />
        <Badge size="xs">{displayLabel(property.propertyType)}</Badge>
        <Badge size="xs">{property.currency}</Badge>
        {!linkedMortgage && <Badge size="xs">Unencumbered</Badge>}
        <span className="ml-1 text-caption text-fg-subtle">{txnCount} transactions</span>
      </div>
    </div>
  );
}

/** The phone card keeps the value and equity up front; this button opens the rest. */
function PropertyDetailsToggle({
  open,
  controlsId,
  label,
  onToggle,
}: Readonly<{ open: boolean; controlsId: string; label: string; onToggle: () => void }>) {
  const text = open ? 'Hide details' : 'Show details';
  return (
    <button
      type="button"
      aria-expanded={open}
      aria-controls={controlsId}
      aria-label={`${text} for ${label}`}
      onClick={onToggle}
      className="inline-flex min-h-11 items-center gap-1 text-label text-brand-fg underline-offset-2 hover:underline md:hidden focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus-ring"
    >
      {text}
      <ChevronDown
        size={14}
        aria-hidden
        className={cn('transition-transform duration-fast', open && 'rotate-180')}
      />
    </button>
  );
}

function PropertyCard(props: PropertyCardProps) {
  const { property, propertyTxns, mortgageById, mortgageTxns, isExpanded, fmtNative } = props;
  const { onUpdateProperty, onToggleExpanded, onAddTxnForProperty, onEditTxn, onDeleteTxn } = props;
  const linkedMortgage =
    property.mortgageId != null ? mortgageById.get(property.mortgageId) : undefined;
  const ownTxns = propertyTxns.filter((t) => t.propertyId === property.id);
  // The linked mortgage's rows, archived mortgage or not: the repayments still paid this property.
  const linkedMortgageTxns =
    property.mortgageId == null
      ? []
      : mortgageTxns.filter((t) => t.mortgageId === property.mortgageId);
  const stats = computePropertyCardStats(property, ownTxns, linkedMortgageTxns);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const detailsId = useId();

  return (
    <Card padding="none" className="overflow-hidden">
      <div className="space-y-4 p-4">
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
        <PropertyDetailsToggle
          open={detailsOpen}
          controlsId={detailsId}
          label={property.address}
          onToggle={() => setDetailsOpen(!detailsOpen)}
        />
        <div id={detailsId} className={cn('space-y-4', !detailsOpen && 'max-md:hidden')}>
          <MortgageLinkRow
            property={property}
            linkedMortgage={linkedMortgage}
            fmtNative={fmtNative}
          />
          {stats.hasPL && (
            <PropertyPLGrid property={property} stats={stats} fmtNative={fmtNative} />
          )}
          {stats.grossYield > 0 && !stats.hasPL && (
            <PropertyYieldBadges grossYield={stats.grossYield} netYield={stats.netYield} />
          )}
        </div>
      </div>
      {isExpanded && (
        <PropertyTxnHistory
          property={property}
          transactions={ownTxns}
          mortgageTransactions={linkedMortgageTxns}
          onAdd={() => onAddTxnForProperty(property)}
          onEdit={onEditTxn}
          onDelete={onDeleteTxn}
        />
      )}
    </Card>
  );
}

type PropertyCardsListProps = Omit<PropertyTabProps, 'onAddProperty'> & {
  expandedPropertyId: number | null;
};

function PropertyCardsList({
  properties,
  propertyTxns,
  mortgageById,
  mortgageTxns,
  expandedPropertyId,
  fmtNative,
  onUpdateProperty,
  onToggleExpanded,
  onAddTxnForProperty,
  onEditTxn,
  onDeleteTxn,
}: PropertyCardsListProps) {
  return (
    <div className="space-y-4 p-4 max-sm:p-3">
      {properties.map((property) => (
        <PropertyCard
          key={property.id}
          property={property}
          propertyTxns={propertyTxns}
          mortgageById={mortgageById}
          mortgageTxns={mortgageTxns}
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
  mortgageTxns,
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
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-default px-3 py-2 max-sm:px-4">
        <p className="text-caption text-fg-subtle">
          {properties.length} {properties.length === 1 ? 'property' : 'properties'} · use the arrow
          on a card to view transactions
        </p>
        <Button
          variant="primary"
          size="sm"
          onClick={onAddProperty}
          leadingIcon={<Plus size={12} aria-hidden />}
          className="max-sm:w-full"
        >
          Add property
        </Button>
      </div>
      {properties.length === 0 ? (
        <EmptyState
          icon={Home}
          title="No properties yet"
          description="Add your first property to track its value, rental income, expenses and link it to a mortgage."
          action={{ label: 'Add property', onClick: onAddProperty }}
        />
      ) : (
        <PropertyCardsList
          properties={properties}
          propertyTxns={propertyTxns}
          mortgageById={mortgageById}
          mortgageTxns={mortgageTxns}
          expandedPropertyId={expandedPropertyId}
          fmtNative={fmtNative}
          onUpdateProperty={onUpdateProperty}
          onToggleExpanded={onToggleExpanded}
          onAddTxnForProperty={onAddTxnForProperty}
          onEditTxn={onEditTxn}
          onDeleteTxn={onDeleteTxn}
        />
      )}
      <div className="px-4 pb-4 max-sm:px-3">
        <PropertiesArchivedSection />
      </div>
    </div>
  );
}
