import { usePagination } from '@/hooks/usePagination';
import { useSortedRows } from '@/hooks/useSortedRows';
import { useMemo, useState, type ReactNode } from 'react';
import { Archive, ChevronDown, ChevronUp, Edit3, Plus, RefreshCcw } from 'lucide-react';
import {
  formatItemType,
  holdingValue,
  sumMoney,
  type Holding,
  type HoldingPriceSyncResult,
  type HoldingTransaction,
} from '@quro/shared';
import {
  Badge,
  Button,
  Change,
  DataTable,
  DataTableCell,
  DataTableRow,
  IconButton,
  Pagination,
  RowActions,
  type DataTableColumn,
  type DataTableSortState,
} from '@/components/ui';
import { stopRowClick } from '@/components/finance/stopRowClick';
import { useUnitPriceFormatter, type UnitPriceFormatFn } from '../hooks/useUnitPriceFormatter';
import { formatShares, groupHoldingTransactions, type Position } from '../utils/position';
import { isPriceStale } from '../utils/priceFreshness';
import { HoldingPositionPanel, getEffectivePrice } from './HoldingPositionPanel';
import { HoldingTxnHistory } from './HoldingTxnHistory';

type FormatBaseFn = (value: number, currency?: string, compact?: boolean) => string;
type FormatNativeFn = (value: number, currency: string, compact?: boolean) => string;
type ConvertFn = (value: number, currency: string) => number;

type BrokerageTabProps = {
  activeHoldings: Holding[];
  closedHoldings: Holding[];
  holdingTxns: HoldingTransaction[];
  positions: Record<number, Position>;
  baseCurrency: string;
  totalDividendsBase: number;
  totalRealizedBase: number;
  totalBrokerageBase: number;
  totalGainBase: number;
  gainPct: number;
  expandedHoldingId: number | null;
  fmtBase: FormatBaseFn;
  fmtNative: FormatNativeFn;
  convertToBase: ConvertFn;
  isForeign: (currency: string) => boolean;
  onAddHolding: () => void;
  onEditHolding: (holding: Holding) => void;
  onToggleExpanded: (id: number) => void;
  onAddTxnForHolding: (holding: Holding) => void;
  onEditTxn: (transaction: HoldingTransaction) => void;
  onDeleteTxn: (id: number) => void;
  onSyncPrices: () => void;
  isSyncingPrices: boolean;
  syncSummary: HoldingPriceSyncResult | null;
};

type HoldingHistoryHandlers = Pick<
  BrokerageTabProps,
  'onAddTxnForHolding' | 'onEditTxn' | 'onDeleteTxn'
>;

type HoldingRowMetrics = {
  nativeValue: number;
  valueInBase: number;
  gain: number;
  gainPctHolding: number;
  foreign: boolean;
  txnCount: number;
};

type ClosedHoldingMetrics = {
  txnCount: number;
  lastSellPrice: number | null;
  costBasis: number;
  realizedPct: number;
};

const ACTIVE_COLUMN_COUNT = 7;
const CLOSED_COLUMN_COUNT = 5;

// Paging keeps an unusually long holdings list from rendering thousands of rows at once.
const HOLDINGS_PAGE_SIZE = 25;

function formatSyncDate(priceUpdatedAt: string | null | undefined): string | null {
  if (!priceUpdatedAt) return null;
  const date = new Date(priceUpdatedAt);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

function buildBrokerageHoldingColumns(
  baseCurrency: string,
  positions: Record<number, Position>,
  metricsById: Record<number, HoldingRowMetrics>,
): readonly DataTableColumn<Holding>[] {
  return [
    {
      key: 'asset',
      sortValue: (row) => row.name,
      header: 'Asset',
      phoneCard: 'title',
      width: '28%',
      sortable: true,
    },
    {
      key: 'units',
      sortValue: (row) => positions[row.id].shares,
      header: 'Units',
      phoneCard: 'metric',
      numeric: true,
      sortable: true,
      defaultSortDirection: 'desc',
      width: '9%',
    },
    {
      key: 'avgCost',
      sortValue: (row) => positions[row.id].avgCost,
      header: 'Avg cost',
      numeric: true,
      priority: 'secondary',
      phoneCard: 'hiddenUntilDetails',
      sortable: true,
      defaultSortDirection: 'desc',
      width: '11%',
    },
    {
      key: 'current',
      sortValue: (row) => getEffectivePrice(row),
      header: 'Price',
      phoneCard: 'metric',
      numeric: true,
      sortable: true,
      defaultSortDirection: 'desc',
      width: '13%',
    },
    {
      key: 'value',
      sortValue: (row) => metricsById[row.id].valueInBase,
      header: `Value (${baseCurrency})`,
      phoneCard: 'headline',
      numeric: true,
      sortable: true,
      defaultSortDirection: 'desc',
      width: '14%',
    },
    {
      key: 'gain',
      sortValue: (row) => metricsById[row.id].gain,
      header: 'Gain / loss',
      phoneCard: 'headlineNote',
      numeric: true,
      sortable: true,
      defaultSortDirection: 'desc',
      width: '15%',
    },
    { key: 'actions', header: '', priority: 'actions', width: 72 },
  ];
}

function buildClosedHoldingColumns(
  positions: Record<number, Position>,
  metricsById: Record<number, ClosedHoldingMetrics>,
): readonly DataTableColumn<Holding>[] {
  return [
    {
      key: 'asset',
      sortValue: (row) => row.name,
      header: 'Asset',
      phoneCard: 'title',
      width: '40%',
      sortable: true,
    },
    {
      key: 'sold',
      sortValue: (row) => metricsById[row.id].lastSellPrice ?? 0,
      header: 'Last sell price',
      phoneCard: 'metric',
      numeric: true,
      sortable: true,
      defaultSortDirection: 'desc',
      width: '18%',
    },
    {
      key: 'dividends',
      sortValue: (row) => positions[row.id].totalDividends,
      header: 'Dividends',
      phoneCard: 'metric',
      numeric: true,
      sortable: true,
      defaultSortDirection: 'desc',
      width: '18%',
    },
    {
      key: 'realized',
      sortValue: (row) => positions[row.id].realizedGain,
      header: 'Realized P&L',
      phoneCard: 'headline',
      numeric: true,
      sortable: true,
      defaultSortDirection: 'desc',
      width: '18%',
    },
    { key: 'actions', header: '', priority: 'actions', width: 72 },
  ];
}

function computeHoldingRowMetrics(
  holding: Holding,
  holdingTxns: readonly HoldingTransaction[],
  position: Position,
  convertToBase: ConvertFn,
  isForeign: (currency: string) => boolean,
): HoldingRowMetrics {
  const price = getEffectivePrice(holding);
  const nativeValue = holdingValue(position.shares, price);
  const valueInBase = convertToBase(nativeValue, holding.currency);
  const gain = sumMoney([nativeValue, -position.costBasis]);
  const gainPctHolding =
    position.avgCost > 0 ? ((price - position.avgCost) / position.avgCost) * 100 : 0;
  const foreign = isForeign(holding.currency);
  const txnCount = holdingTxns.filter((t) => t.holdingId === holding.id).length;
  return { nativeValue, valueInBase, gain, gainPctHolding, foreign, txnCount };
}

/** Name on the first line; ticker, type, sector, currency and the count as a caption. */
function HoldingAssetCell({
  holding,
  txnCount,
  closed = false,
}: Readonly<{ holding: Holding; txnCount: number; closed?: boolean }>) {
  const itemTypeLabel = formatItemType(holding.itemType);
  const sectorLabel = holding.sector?.trim();
  const meta = [
    holding.ticker,
    itemTypeLabel,
    sectorLabel && sectorLabel !== itemTypeLabel ? sectorLabel : null,
    holding.currency,
    `${txnCount} transactions`,
  ].filter(Boolean);
  return (
    <div className="min-w-0">
      <div className="flex min-w-0 items-center gap-1.5">
        <p className={closed ? 'truncate text-fg-muted' : 'truncate font-medium text-fg'}>
          {holding.name}
        </p>
        {closed && <Badge className="shrink-0">Closed</Badge>}
      </div>
      <p className="truncate text-caption text-fg-subtle max-md:whitespace-normal">
        {meta.join(' · ')}
      </p>
    </div>
  );
}

/** A figure with an optional caption under it, right-aligned in a numeric column. */
function FigureWithCaption({
  figure,
  caption,
  inlineOnPhone = false,
}: Readonly<{
  figure: ReactNode;
  caption?: ReactNode;
  /** On a phone card the caption sits beside the figure instead of under it. */
  inlineOnPhone?: boolean;
}>) {
  return (
    <div
      className={
        inlineOnPhone
          ? 'max-md:flex max-md:flex-wrap max-md:justify-end max-md:gap-x-1.5'
          : undefined
      }
    >
      <div>{figure}</div>
      {caption ? <div className="text-caption text-fg-subtle">{caption}</div> : null}
    </div>
  );
}

function ExpandToggle({
  isExpanded,
  onToggle,
  className,
}: Readonly<{ isExpanded: boolean; onToggle: () => void; className?: string }>) {
  const label = isExpanded ? 'Collapse' : 'View transactions';
  return (
    <IconButton
      onClick={stopRowClick(onToggle)}
      icon={isExpanded ? ChevronUp : ChevronDown}
      label={label}
      title={label}
      aria-expanded={isExpanded}
      size="sm"
      variant="subtle"
      className={className}
    />
  );
}

function HoldingRowActions({
  holding,
  isExpanded,
  mergedDetailsOnPhone = false,
  onEditHolding,
  onToggleExpanded,
}: Readonly<{
  holding: Holding;
  isExpanded: boolean;
  /** The phone card's details button opens the history too, so the chevron is left out there. */
  mergedDetailsOnPhone?: boolean;
  onEditHolding: (holding: Holding) => void;
  onToggleExpanded: (id: number) => void;
}>) {
  return (
    <RowActions className="max-md:justify-start">
      <IconButton
        onClick={stopRowClick(() => onEditHolding(holding))}
        icon={Edit3}
        label="Edit holding"
        title="Edit holding"
        size="sm"
        variant="subtle"
      />
      <ExpandToggle
        isExpanded={isExpanded}
        onToggle={() => onToggleExpanded(holding.id)}
        className={mergedDetailsOnPhone ? 'max-md:hidden' : undefined}
      />
    </RowActions>
  );
}

function HoldingHistoryRow({
  holding,
  holdingTxns,
  position,
  colSpan,
  onEditHolding,
  onAddTxnForHolding,
  onEditTxn,
  onDeleteTxn,
}: Readonly<
  HoldingHistoryHandlers & {
    holding: Holding;
    holdingTxns: HoldingTransaction[];
    position: Position;
    colSpan: number;
    /** Set for an active holding, which shows its position above the transactions. */
    onEditHolding?: (holding: Holding) => void;
  }
>) {
  return (
    <DataTableRow mobileCard={false} className="md:hover:bg-transparent">
      <DataTableCell
        colSpan={colSpan}
        className="p-0 max-md:block max-md:py-0"
        contentClassName="w-full"
      >
        {onEditHolding ? (
          <HoldingPositionPanel
            holding={holding}
            position={position}
            onEditHolding={onEditHolding}
          />
        ) : null}
        <HoldingTxnHistory
          holding={holding}
          transactions={holdingTxns}
          onAdd={() => onAddTxnForHolding(holding)}
          onEdit={onEditTxn}
          onDelete={onDeleteTxn}
        />
      </DataTableCell>
    </DataTableRow>
  );
}

/** The effective price (a manual price is marked M) over its sync date or "sync off". */
function HoldingPriceCell({
  holding,
  fmtPrice,
}: Readonly<{ holding: Holding; fmtPrice: UnitPriceFormatFn }>) {
  const stale = isPriceStale(holding);
  const syncDate = formatSyncDate(holding.priceUpdatedAt);
  let syncCaption: ReactNode = holding.currency;
  if (holding.excludeFromSync) syncCaption = 'sync off';
  else if (stale) {
    syncCaption = (
      <span className="text-warning" title="The price has not synced for more than a week">
        Stale · {syncDate}
      </span>
    );
  } else if (syncDate) syncCaption = syncDate;
  return (
    <FigureWithCaption
      figure={
        <span className="inline-flex items-center gap-1">
          {holding.manualPrice != null && (
            <Badge tone="warning" size="xs" title="Manual price">
              M
            </Badge>
          )}
          {fmtPrice(getEffectivePrice(holding), holding.currency)}
        </span>
      }
      caption={syncCaption}
    />
  );
}

type HoldingRowProps = HoldingHistoryHandlers & {
  metrics: HoldingRowMetrics;
  holding: Holding;
  holdingTxns: HoldingTransaction[];
  position: Position;
  isExpanded: boolean;
  fmtBase: FormatBaseFn;
  fmtNative: FormatNativeFn;
  fmtPrice: UnitPriceFormatFn;
  onEditHolding: (holding: Holding) => void;
  onToggleExpanded: (id: number) => void;
};

function HoldingRow({
  metrics,
  holding,
  holdingTxns,
  position,
  isExpanded,
  fmtBase,
  fmtNative,
  fmtPrice,
  onEditHolding,
  onToggleExpanded,
  ...handlers
}: Readonly<HoldingRowProps>) {
  const { nativeValue, valueInBase, gain, gainPctHolding, foreign, txnCount } = metrics;

  return (
    <>
      <DataTableRow
        interactive
        selected={isExpanded}
        onClick={() => onToggleExpanded(holding.id)}
        detailsOpen={isExpanded}
        onDetailsOpenChange={() => onToggleExpanded(holding.id)}
        detailsLabel={holding.name}
      >
        <DataTableCell columnKey="asset" stacked>
          <HoldingAssetCell holding={holding} txnCount={txnCount} />
        </DataTableCell>
        <DataTableCell columnKey="units">{formatShares(position.shares)}</DataTableCell>
        <DataTableCell columnKey="avgCost">
          {fmtPrice(position.avgCost, holding.currency)}
        </DataTableCell>
        <DataTableCell columnKey="current">
          <HoldingPriceCell holding={holding} fmtPrice={fmtPrice} />
        </DataTableCell>
        <DataTableCell columnKey="value">
          <FigureWithCaption
            figure={<span className="font-medium text-fg">{fmtBase(valueInBase)}</span>}
            caption={foreign ? fmtNative(nativeValue, holding.currency, true) : undefined}
          />
        </DataTableCell>
        <DataTableCell columnKey="gain">
          <FigureWithCaption
            inlineOnPhone
            figure={<Change value={gain} format="amount" currency={holding.currency} />}
            caption={<Change value={gainPctHolding} format="percent" className="text-caption" />}
          />
        </DataTableCell>
        <DataTableCell columnKey="actions" contentClassName="md:ml-auto">
          <HoldingRowActions
            holding={holding}
            isExpanded={isExpanded}
            mergedDetailsOnPhone
            onEditHolding={onEditHolding}
            onToggleExpanded={onToggleExpanded}
          />
        </DataTableCell>
      </DataTableRow>
      {isExpanded && (
        <HoldingHistoryRow
          holding={holding}
          holdingTxns={holdingTxns}
          position={position}
          colSpan={ACTIVE_COLUMN_COUNT}
          onEditHolding={onEditHolding}
          {...handlers}
        />
      )}
    </>
  );
}

type BrokerageTotalRowProps = Pick<
  BrokerageTabProps,
  | 'totalBrokerageBase'
  | 'totalDividendsBase'
  | 'totalRealizedBase'
  | 'totalGainBase'
  | 'gainPct'
  | 'baseCurrency'
  | 'fmtBase'
>;

function BrokerageTotalRow({
  totalBrokerageBase,
  totalDividendsBase,
  totalRealizedBase,
  totalGainBase,
  gainPct,
  baseCurrency,
  fmtBase,
}: Readonly<BrokerageTotalRowProps>) {
  return (
    <DataTableRow data-total cardDetails={false}>
      <DataTableCell columnKey="asset" stacked>
        <div className="min-w-0">
          <p>Total portfolio</p>
          <p className="truncate text-caption font-normal text-fg-subtle max-md:whitespace-normal">
            +{fmtBase(totalDividendsBase)} dividends ·{' '}
            <Change
              value={totalRealizedBase}
              format="amount"
              currency={baseCurrency}
              showArrow={false}
              className="text-caption font-normal"
            />{' '}
            realized
          </p>
        </div>
      </DataTableCell>
      <DataTableCell columnKey="units" className="max-md:hidden" />
      <DataTableCell columnKey="avgCost" className="max-md:hidden" />
      <DataTableCell columnKey="current" className="max-md:hidden" />
      <DataTableCell columnKey="value">{fmtBase(totalBrokerageBase)}</DataTableCell>
      <DataTableCell columnKey="gain">
        <FigureWithCaption
          inlineOnPhone
          figure={<Change value={totalGainBase} format="amount" currency={baseCurrency} />}
          caption={<Change value={gainPct} format="percent" className="text-caption" />}
        />
      </DataTableCell>
      <DataTableCell columnKey="actions" className="max-md:hidden" />
    </DataTableRow>
  );
}

function holdingNameOrder(left: Holding, right: Holding) {
  return left.name.localeCompare(right.name) || left.id - right.id;
}

function useHoldingRowMetrics(
  holdings: Holding[],
  holdingTxns: HoldingTransaction[],
  positions: Record<number, Position>,
  convertToBase: ConvertFn,
  isForeign: (currency: string) => boolean,
) {
  return useMemo(() => {
    const grouped = groupHoldingTransactions(holdingTxns);
    return Object.fromEntries(
      holdings.map((holding) => [
        holding.id,
        computeHoldingRowMetrics(
          holding,
          grouped.get(holding.id) ?? [],
          positions[holding.id],
          convertToBase,
          isForeign,
        ),
      ]),
    );
  }, [holdings, holdingTxns, positions, convertToBase, isForeign]);
}

type BrokerageHoldingsListProps = HoldingHistoryHandlers &
  BrokerageTotalRowProps & {
    holdings: Holding[];
    holdingTxns: HoldingTransaction[];
    positions: Record<number, Position>;
    expandedHoldingId: number | null;
    fmtNative: FormatNativeFn;
    convertToBase: ConvertFn;
    isForeign: (currency: string) => boolean;
    onEditHolding: (holding: Holding) => void;
    onToggleExpanded: (id: number) => void;
    toolbar: ReactNode;
  };

function HoldingsPagination({
  pagination,
  totalCount,
}: Readonly<{
  pagination: ReturnType<typeof usePagination<Holding>>;
  totalCount: number;
}>) {
  if (totalCount <= HOLDINGS_PAGE_SIZE) return null;
  return (
    <Pagination
      page={pagination.safeCurrentPage}
      totalPages={pagination.totalPages}
      rangeStart={pagination.rangeStart}
      rangeEnd={pagination.rangeEnd}
      totalCount={totalCount}
      onChange={pagination.handlePageChange}
    />
  );
}

function BrokerageHoldingsList({
  holdings,
  holdingTxns,
  positions,
  expandedHoldingId,
  fmtNative,
  convertToBase,
  isForeign,
  onEditHolding,
  onToggleExpanded,
  onAddTxnForHolding,
  onEditTxn,
  onDeleteTxn,
  toolbar,
  ...totals
}: Readonly<BrokerageHoldingsListProps>) {
  const fmtPrice = useUnitPriceFormatter();
  const [sort, setSort] = useState<DataTableSortState>({ columnKey: 'value', direction: 'desc' });
  const metricsById = useHoldingRowMetrics(
    holdings,
    holdingTxns,
    positions,
    convertToBase,
    isForeign,
  );
  const columns = useMemo(
    () => buildBrokerageHoldingColumns(totals.baseCurrency, positions, metricsById),
    [totals.baseCurrency, positions, metricsById],
  );
  const sortedHoldings = useSortedRows(holdings, columns, sort, holdingNameOrder);
  const pagination = usePagination(
    sortedHoldings,
    HOLDINGS_PAGE_SIZE,
    `${sort.columnKey}:${sort.direction}`,
  );

  return (
    <DataTable
      variant="plain"
      tableVariant="expandable"
      density="default"
      toolbar={toolbar}
      columns={columns}
      sort={sort}
      onSortChange={setSort}
      tableLayout="fixed"
      minWidth={960}
      isEmpty={holdings.length === 0}
      emptyState="No active holdings yet."
      footer={<HoldingsPagination pagination={pagination} totalCount={holdings.length} />}
    >
      {pagination.pageItems.map((holding) => (
        <HoldingRow
          key={holding.id}
          metrics={metricsById[holding.id]}
          holding={holding}
          holdingTxns={holdingTxns}
          position={positions[holding.id]}
          isExpanded={expandedHoldingId === holding.id}
          fmtBase={totals.fmtBase}
          fmtNative={fmtNative}
          fmtPrice={fmtPrice}
          onEditHolding={onEditHolding}
          onToggleExpanded={onToggleExpanded}
          onAddTxnForHolding={onAddTxnForHolding}
          onEditTxn={onEditTxn}
          onDeleteTxn={onDeleteTxn}
        />
      ))}
      {holdings.length > 0 && <BrokerageTotalRow {...totals} />}
    </DataTable>
  );
}

function computeClosedHoldingMetrics(
  holding: Holding,
  holdingTxns: readonly HoldingTransaction[],
  position: Position,
): ClosedHoldingMetrics {
  const txns = holdingTxns.filter((txn) => txn.holdingId === holding.id);
  const txnCount = txns.length;
  const sellTxns = txns
    .filter((txn) => txn.type === 'sell' && Number(txn.shares ?? 0) > 0)
    .sort((a, b) => b.date.localeCompare(a.date));
  const lastSellPrice = sellTxns[0]?.price ?? null;
  const costBasis = sumMoney(
    txns
      .filter((txn) => txn.type === 'buy')
      .map((txn) => holdingValue(Number(txn.shares ?? 0), txn.price)),
  );
  const realizedPct = costBasis > 0 ? (position.realizedGain / costBasis) * 100 : 0;
  return { txnCount, lastSellPrice, costBasis, realizedPct };
}

type ClosedHoldingRowProps = HoldingHistoryHandlers & {
  metrics: ClosedHoldingMetrics;
  holding: Holding;
  holdingTxns: HoldingTransaction[];
  position: Position;
  isExpanded: boolean;
  fmtBase: FormatBaseFn;
  fmtNative: FormatNativeFn;
  fmtPrice: UnitPriceFormatFn;
  convertToBase: ConvertFn;
  isForeign: (currency: string) => boolean;
  onEditHolding: (holding: Holding) => void;
  onToggleExpanded: (id: number) => void;
};

function ClosedRealizedFigure({
  realizedGain,
  currency,
  realizedPct,
}: Readonly<{ realizedGain: number; currency: string; realizedPct: number | null }>) {
  return (
    <FigureWithCaption
      figure={<Change value={realizedGain} format="amount" currency={currency} />}
      caption={
        realizedPct === null ? (
          '—'
        ) : (
          <Change value={realizedPct} format="percent" className="text-caption" />
        )
      }
    />
  );
}

function ClosedHoldingRow({
  metrics,
  holding,
  holdingTxns,
  position,
  isExpanded,
  fmtBase,
  fmtNative,
  fmtPrice,
  convertToBase,
  isForeign,
  onEditHolding,
  onToggleExpanded,
  ...handlers
}: Readonly<ClosedHoldingRowProps>) {
  const foreign = isForeign(holding.currency);
  const { txnCount, lastSellPrice, costBasis, realizedPct } = metrics;
  const { totalDividends, realizedGain } = position;

  return (
    <>
      <DataTableRow
        interactive
        selected={isExpanded}
        onClick={() => onToggleExpanded(holding.id)}
        detailsOpen={isExpanded}
        onDetailsOpenChange={() => onToggleExpanded(holding.id)}
        detailsLabel={holding.name}
      >
        <DataTableCell columnKey="asset" stacked>
          <HoldingAssetCell holding={holding} txnCount={txnCount} closed />
        </DataTableCell>
        <DataTableCell columnKey="sold" className="text-fg-muted">
          {lastSellPrice === null ? (
            <FigureWithCaption figure="—" caption="no sells" />
          ) : (
            fmtPrice(lastSellPrice, holding.currency)
          )}
        </DataTableCell>
        <DataTableCell columnKey="dividends" className="text-fg-muted">
          {totalDividends > 0 ? (
            <FigureWithCaption
              figure={`+${fmtBase(convertToBase(totalDividends, holding.currency))}`}
              caption={
                foreign ? `+${fmtNative(totalDividends, holding.currency, true)}` : undefined
              }
            />
          ) : (
            '—'
          )}
        </DataTableCell>
        <DataTableCell columnKey="realized">
          <ClosedRealizedFigure
            realizedGain={realizedGain}
            currency={holding.currency}
            realizedPct={costBasis > 0 ? realizedPct : null}
          />
        </DataTableCell>
        <DataTableCell columnKey="actions" contentClassName="md:ml-auto">
          <HoldingRowActions
            holding={holding}
            isExpanded={isExpanded}
            mergedDetailsOnPhone
            onEditHolding={onEditHolding}
            onToggleExpanded={onToggleExpanded}
          />
        </DataTableCell>
      </DataTableRow>
      {isExpanded && (
        <HoldingHistoryRow
          holding={holding}
          holdingTxns={holdingTxns}
          position={position}
          colSpan={CLOSED_COLUMN_COUNT}
          {...handlers}
        />
      )}
    </>
  );
}

type ClosedHoldingsSummary = {
  realized: ReactNode;
  dividends: string;
};

function buildClosedHoldingsSummary(
  closedHoldings: Holding[],
  positions: Record<number, Position>,
  convertToBase: ConvertFn,
  fmtBase: FormatBaseFn,
  fmtNative: FormatNativeFn,
  baseCurrency: string,
): ClosedHoldingsSummary {
  const uniqueCurrencies = [...new Set(closedHoldings.map((holding) => holding.currency))];
  const singleCurrency = uniqueCurrencies.length === 1 ? uniqueCurrencies[0] : null;

  if (!singleCurrency) {
    const totalClosedRealizedBase = sumMoney(
      closedHoldings.map((holding) =>
        convertToBase(positions[holding.id].realizedGain, holding.currency),
      ),
    );
    const totalClosedDividendsBase = sumMoney(
      closedHoldings.map((holding) =>
        convertToBase(positions[holding.id].totalDividends, holding.currency),
      ),
    );
    return {
      realized: (
        <Change
          value={totalClosedRealizedBase}
          format="amount"
          currency={baseCurrency}
          showArrow={false}
          className="text-caption"
        />
      ),
      dividends: fmtBase(totalClosedDividendsBase),
    };
  }

  const totalClosedRealizedNative = sumMoney(
    closedHoldings.map((holding) => positions[holding.id].realizedGain),
  );
  const totalClosedDividendsNative = sumMoney(
    closedHoldings.map((holding) => positions[holding.id].totalDividends),
  );

  return {
    realized: (
      <Change
        value={totalClosedRealizedNative}
        format="amount"
        currency={singleCurrency}
        showArrow={false}
        className="text-caption"
      />
    ),
    dividends: fmtNative(totalClosedDividendsNative, singleCurrency),
  };
}

function useClosedHoldingMetrics(
  closedHoldings: Holding[],
  holdingTxns: HoldingTransaction[],
  positions: Record<number, Position>,
) {
  return useMemo(() => {
    const grouped = groupHoldingTransactions(holdingTxns);
    return Object.fromEntries(
      closedHoldings.map((holding) => [
        holding.id,
        computeClosedHoldingMetrics(holding, grouped.get(holding.id) ?? [], positions[holding.id]),
      ]),
    );
  }, [closedHoldings, holdingTxns, positions]);
}

type ClosedHoldingsSectionProps = HoldingHistoryHandlers & {
  closedHoldings: Holding[];
  holdingTxns: HoldingTransaction[];
  positions: Record<number, Position>;
  expandedHoldingId: number | null;
  baseCurrency: string;
  fmtBase: FormatBaseFn;
  fmtNative: FormatNativeFn;
  convertToBase: ConvertFn;
  isForeign: (currency: string) => boolean;
  onEditHolding: (holding: Holding) => void;
  onToggleExpanded: (id: number) => void;
  showClosed: boolean;
  onToggleClosed: () => void;
};

function ClosedHoldingsHeader({
  closedCount,
  showClosed,
  onToggleClosed,
}: Readonly<{ closedCount: number; showClosed: boolean; onToggleClosed: () => void }>) {
  return (
    <button
      type="button"
      onClick={onToggleClosed}
      aria-expanded={showClosed}
      className="flex min-h-9 w-full items-center gap-2 px-3 text-left transition-colors duration-fast hover:bg-surface-muted active:bg-surface-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus-ring max-sm:min-h-11 max-sm:px-4"
    >
      <Archive size={14} className="shrink-0 text-fg-faint" aria-hidden />
      <span className="text-title-section text-fg">Closed holdings</span>
      <Badge>{closedCount}</Badge>
      <span className="truncate text-caption text-fg-subtle max-sm:hidden">
        positions no longer held
      </span>
      <span className="ml-auto flex shrink-0 items-center gap-1 text-caption text-fg-subtle">
        {showClosed ? 'Hide' : 'Show'}
        {showClosed ? <ChevronUp size={14} aria-hidden /> : <ChevronDown size={14} aria-hidden />}
      </span>
    </button>
  );
}

function ClosedHoldingsFooter({
  closedCount,
  summary,
}: Readonly<{ closedCount: number; summary: ClosedHoldingsSummary }>) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-caption text-fg-subtle">
      <p>
        {closedCount} closed positions · total realized {summary.realized} · dividends{' '}
        {summary.dividends}
      </p>
      <p>excluded from active portfolio totals</p>
    </div>
  );
}

function ClosedHoldingsSection({
  closedHoldings,
  holdingTxns,
  positions,
  expandedHoldingId,
  baseCurrency,
  fmtBase,
  fmtNative,
  convertToBase,
  isForeign,
  onEditHolding,
  onToggleExpanded,
  showClosed,
  onToggleClosed,
  ...handlers
}: Readonly<ClosedHoldingsSectionProps>) {
  const fmtPrice = useUnitPriceFormatter();
  const [sort, setSort] = useState<DataTableSortState>({
    columnKey: 'realized',
    direction: 'desc',
  });
  const metricsById = useClosedHoldingMetrics(closedHoldings, holdingTxns, positions);
  const columns = useMemo(
    () => buildClosedHoldingColumns(positions, metricsById),
    [positions, metricsById],
  );
  const sortedClosedHoldings = useSortedRows(closedHoldings, columns, sort, holdingNameOrder);

  if (closedHoldings.length === 0) return null;
  const summary = buildClosedHoldingsSummary(
    closedHoldings,
    positions,
    convertToBase,
    fmtBase,
    fmtNative,
    baseCurrency,
  );

  return (
    <div className="border-t border-border-default">
      <ClosedHoldingsHeader
        closedCount={closedHoldings.length}
        showClosed={showClosed}
        onToggleClosed={onToggleClosed}
      />
      {showClosed && (
        <DataTable
          variant="plain"
          tableVariant="expandable"
          density="default"
          columns={columns}
          sort={sort}
          onSortChange={setSort}
          tableLayout="fixed"
          minWidth={900}
          className="border-t border-border-default"
          footer={<ClosedHoldingsFooter closedCount={closedHoldings.length} summary={summary} />}
        >
          {sortedClosedHoldings.map((holding) => (
            <ClosedHoldingRow
              key={holding.id}
              metrics={metricsById[holding.id]}
              holding={holding}
              holdingTxns={holdingTxns}
              position={positions[holding.id]}
              isExpanded={expandedHoldingId === holding.id}
              fmtBase={fmtBase}
              fmtNative={fmtNative}
              fmtPrice={fmtPrice}
              convertToBase={convertToBase}
              isForeign={isForeign}
              onEditHolding={onEditHolding}
              onToggleExpanded={onToggleExpanded}
              {...handlers}
            />
          ))}
        </DataTable>
      )}
    </div>
  );
}

type BrokerageToolbarProps = {
  activeHoldingsCount: number;
  totalHoldingsCount: number;
  onAddHolding: () => void;
  onSyncPrices: () => void;
  isSyncingPrices: boolean;
  syncSummary: HoldingPriceSyncResult | null;
};

function BrokerageToolbar({
  activeHoldingsCount,
  totalHoldingsCount,
  onAddHolding,
  onSyncPrices,
  isSyncingPrices,
  syncSummary,
}: Readonly<BrokerageToolbarProps>) {
  const syncSummaryText = syncSummary
    ? `${syncSummary.updatedHoldings}/${syncSummary.requestedHoldings} updated · ${syncSummary.skippedHoldings} skipped`
    : null;
  const closedCount = totalHoldingsCount - activeHoldingsCount;

  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="min-w-0 text-caption text-fg-subtle">
        <p>{activeHoldingsCount} active holdings · click a row to view and record transactions</p>
        {syncSummaryText && <p>Last sync: {syncSummaryText}</p>}
        {closedCount > 0 && (
          <p>{closedCount} closed holdings excluded from sync and active portfolio totals</p>
        )}
      </div>
      <div className="flex items-center gap-2 max-sm:w-full max-sm:*:flex-1">
        <Button
          variant="secondary"
          size="sm"
          onClick={onSyncPrices}
          disabled={activeHoldingsCount === 0}
          loading={isSyncingPrices}
          leadingIcon={<RefreshCcw size={12} aria-hidden />}
          title={
            activeHoldingsCount === 0
              ? 'No active holdings to sync'
              : `Sync prices for ${activeHoldingsCount} active holdings`
          }
        >
          Sync prices
        </Button>
        <Button
          variant="primary"
          size="sm"
          onClick={onAddHolding}
          leadingIcon={<Plus size={12} aria-hidden />}
        >
          Add holding
        </Button>
      </div>
    </div>
  );
}

export function BrokerageTab(props: Readonly<BrokerageTabProps>) {
  const {
    activeHoldings,
    closedHoldings,
    holdingTxns,
    positions,
    baseCurrency,
    totalDividendsBase,
    totalRealizedBase,
    totalBrokerageBase,
    totalGainBase,
    gainPct,
    expandedHoldingId,
    fmtBase,
    fmtNative,
    convertToBase,
    isForeign,
    onAddHolding,
    onEditHolding,
    onToggleExpanded,
    onAddTxnForHolding,
    onEditTxn,
    onDeleteTxn,
    onSyncPrices,
    isSyncingPrices,
    syncSummary,
  } = props;
  const [showClosed, setShowClosed] = useState(true);
  const handlers = { onAddTxnForHolding, onEditTxn, onDeleteTxn };
  return (
    <div>
      <BrokerageHoldingsList
        holdings={activeHoldings}
        holdingTxns={holdingTxns}
        positions={positions}
        expandedHoldingId={expandedHoldingId}
        fmtNative={fmtNative}
        convertToBase={convertToBase}
        isForeign={isForeign}
        onEditHolding={onEditHolding}
        onToggleExpanded={onToggleExpanded}
        baseCurrency={baseCurrency}
        totalBrokerageBase={totalBrokerageBase}
        totalDividendsBase={totalDividendsBase}
        totalRealizedBase={totalRealizedBase}
        totalGainBase={totalGainBase}
        gainPct={gainPct}
        fmtBase={fmtBase}
        toolbar={
          <BrokerageToolbar
            activeHoldingsCount={activeHoldings.length}
            totalHoldingsCount={activeHoldings.length + closedHoldings.length}
            onAddHolding={onAddHolding}
            onSyncPrices={onSyncPrices}
            isSyncingPrices={isSyncingPrices}
            syncSummary={syncSummary}
          />
        }
        {...handlers}
      />
      <ClosedHoldingsSection
        closedHoldings={closedHoldings}
        holdingTxns={holdingTxns}
        positions={positions}
        expandedHoldingId={expandedHoldingId}
        baseCurrency={baseCurrency}
        fmtBase={fmtBase}
        fmtNative={fmtNative}
        convertToBase={convertToBase}
        isForeign={isForeign}
        onEditHolding={onEditHolding}
        onToggleExpanded={onToggleExpanded}
        showClosed={showClosed}
        onToggleClosed={() => setShowClosed((open) => !open)}
        {...handlers}
      />
    </div>
  );
}
