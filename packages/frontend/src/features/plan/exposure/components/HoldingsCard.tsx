import { useMemo, useState } from 'react';
import {
  ASSET_CLASSES,
  ASSET_CLASS_LABELS,
  riskBandLabel,
  suggestAssetClass,
  type AssetClass,
  type ExposureHoldingRow,
  type ExposureView,
} from '@quro/shared';
import {
  Badge,
  Button,
  DataTable,
  DataTableCell,
  DataTableRow,
  Pagination,
  SelectInput,
  type DataTableColumn,
  type DataTableSortState,
} from '@/components/ui';
import { useCurrency } from '@/lib/CurrencyContext';
import { usePagination } from '@/hooks/usePagination';
import { useSortedRows } from '@/hooks/useSortedRows';
import { useClassifyHoldings } from '../hooks';
import type { ExposureFormat } from '../useExposureFormat';

const PAGE_SIZE = 25;

const CLASS_OPTIONS = [
  { value: '', label: 'Choose an asset class' },
  ...ASSET_CLASSES.map((value) => ({ value, label: ASSET_CLASS_LABELS[value] })),
];

const COLUMNS: readonly DataTableColumn<ExposureHoldingRow>[] = [
  { key: 'select', header: '', priority: 'actions', width: 40 },
  {
    key: 'holding',
    header: 'Holding',
    phoneCard: 'title',
    sortable: true,
    sortValue: (row) => row.name,
    width: '30%',
  },
  { key: 'class', header: 'Asset class', phoneCard: 'metric', width: '24%' },
  {
    key: 'risk',
    header: 'Risk class',
    phoneCard: 'metric',
    numeric: true,
    sortable: true,
    sortValue: (row) => row.riskClass ?? 0,
    width: '12%',
  },
  {
    key: 'weight',
    header: 'Weight',
    phoneCard: 'metric',
    numeric: true,
    sortable: true,
    defaultSortDirection: 'desc',
    sortValue: (row) => row.weight,
    width: '10%',
  },
  {
    key: 'value',
    header: 'Value',
    phoneCard: 'headline',
    numeric: true,
    sortable: true,
    defaultSortDirection: 'desc',
    sortValue: (row) => row.valueEur,
    width: '16%',
  },
];

function SelectBox({
  checked,
  label,
  onChange,
  caption,
}: Readonly<{
  checked: boolean;
  label: string;
  onChange: (next: boolean) => void;
  /** Words beside the box on a phone card, where it sits in the footer. */
  caption?: string;
}>) {
  return (
    <label className="flex min-h-8 cursor-pointer items-center gap-2 max-sm:min-h-11">
      <input
        type="checkbox"
        checked={checked}
        aria-label={label}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 rounded-sm border-border-control focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus-ring"
      />
      {caption ? <span className="text-cell text-fg-muted md:hidden">{caption}</span> : null}
    </label>
  );
}

function HoldingCell({ row }: Readonly<{ row: ExposureHoldingRow }>) {
  return (
    <div className="min-w-0">
      <p className="truncate font-medium text-fg">{row.name}</p>
      <p className="truncate text-caption text-fg-subtle max-md:whitespace-normal">
        {[row.ticker, row.sector, row.currency].filter(Boolean).join(' · ')}
      </p>
    </div>
  );
}

function ClassCell({
  row,
  onUse,
  busy,
}: Readonly<{ row: ExposureHoldingRow; onUse: (assetClass: AssetClass) => void; busy: boolean }>) {
  if (row.assetClass) {
    return (
      <span className="block min-w-0 break-words text-fg">
        {ASSET_CLASS_LABELS[row.assetClass]}
      </span>
    );
  }
  const suggestion = suggestAssetClass(row);
  return (
    <div className="min-w-0">
      <Badge tone="muted">Unclassified</Badge>
      {suggestion ? (
        <p className="mt-0.5 text-caption text-fg-subtle max-md:whitespace-normal">
          Suggested: {ASSET_CLASS_LABELS[suggestion.assetClass]}.{' '}
          <button
            type="button"
            disabled={busy}
            title={suggestion.reason}
            onClick={() => onUse(suggestion.assetClass)}
            className="rounded-sm font-medium text-brand-fg underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus-ring max-sm:min-h-11"
          >
            Use it
          </button>
        </p>
      ) : null}
    </div>
  );
}

function RiskCell({ row }: Readonly<{ row: ExposureHoldingRow }>) {
  if (row.riskClass === null) return <span className="text-fg-subtle">None</span>;
  return (
    <span title={riskBandLabel(row.riskClass)}>
      {row.riskClass}
      {row.riskSource === 'override' ? (
        <span className="ml-1 text-caption text-fg-subtle">own</span>
      ) : null}
    </span>
  );
}

function BulkBar({
  selectedIds,
  unclassifiedIds,
  onSelect,
  onClear,
  classify,
}: Readonly<{
  selectedIds: readonly number[];
  unclassifiedIds: readonly number[];
  onSelect: (ids: readonly number[]) => void;
  onClear: () => void;
  classify: ReturnType<typeof useClassifyHoldings>;
}>) {
  const [assetClass, setAssetClass] = useState('');
  const apply = () => {
    if (!assetClass) return;
    classify.mutate(
      selectedIds.map((id) => ({ id, assetClass: assetClass as AssetClass })),
      { onSuccess: onClear },
    );
  };
  return (
    <div className="flex flex-wrap items-center gap-2 px-3 py-2 max-sm:px-4">
      <Button
        variant="secondary"
        size="sm"
        disabled={unclassifiedIds.length === 0}
        onClick={() => onSelect(unclassifiedIds)}
      >
        Select unclassified ({unclassifiedIds.length})
      </Button>
      {selectedIds.length > 0 ? (
        <>
          <span className="text-cell text-fg-muted" aria-live="polite">
            {selectedIds.length} selected
          </span>
          <SelectInput
            aria-label="Asset class for the selected holdings"
            value={assetClass}
            onChange={setAssetClass}
            options={CLASS_OPTIONS}
            className="w-56 max-sm:w-full"
          />
          <Button
            variant="secondary"
            size="sm"
            disabled={!assetClass}
            loading={classify.isPending}
            onClick={apply}
          >
            Assign class
          </Button>
          <Button variant="ghost" size="sm" onClick={onClear}>
            Clear selection
          </Button>
        </>
      ) : null}
      {classify.isError ? (
        <p role="alert" className="w-full text-caption text-danger">
          The asset class could not be saved. Nothing was changed.
        </p>
      ) : null}
    </div>
  );
}

function HoldingTableRow({
  row,
  view,
  format,
  selected,
  busy,
  onToggle,
  onUse,
}: Readonly<{
  row: ExposureHoldingRow;
  view: ExposureView;
  format: ExposureFormat;
  selected: boolean;
  busy: boolean;
  onToggle: (next: boolean) => void;
  onUse: (assetClass: AssetClass) => void;
}>) {
  const { fmtNative } = useCurrency();
  return (
    <DataTableRow selected={selected} cardDetails={false}>
      <DataTableCell columnKey="select" contentClassName="md:ml-auto">
        <SelectBox
          checked={selected}
          label={`Select ${row.name}`}
          onChange={onToggle}
          caption="Select for bulk assign"
        />
      </DataTableCell>
      <DataTableCell columnKey="holding" stacked>
        <HoldingCell row={row} />
      </DataTableCell>
      <DataTableCell columnKey="class" stacked>
        <ClassCell row={row} busy={busy} onUse={onUse} />
      </DataTableCell>
      <DataTableCell columnKey="risk">
        <RiskCell row={row} />
      </DataTableCell>
      <DataTableCell columnKey="weight">{format.percent(row.weight)}</DataTableCell>
      <DataTableCell columnKey="value" stacked>
        <div>
          <div className="font-medium text-fg">{format.money(row.valueEur)}</div>
          {row.currency !== view.baseCurrency ? (
            <div className="text-caption text-fg-subtle">
              {fmtNative(row.nativeValue, row.currency)}
            </div>
          ) : null}
          {row.priceStale ? (
            <div className="text-caption text-warning">Price not synced for over a week</div>
          ) : null}
        </div>
      </DataTableCell>
    </DataTableRow>
  );
}

/**
 * Every valued holding with its weight, class and risk class. Rows can be selected and given an
 * asset class together; a suggestion from the name, sector and type is shown beside an unclassified
 * holding and is saved only when the person chooses to use it.
 */
export function HoldingsCard({
  view,
  format,
}: Readonly<{ view: ExposureView; format: ExposureFormat }>) {
  const classify = useClassifyHoldings();
  const [selected, setSelected] = useState<ReadonlySet<number>>(new Set());
  const [sort, setSort] = useState<DataTableSortState>({ columnKey: 'value', direction: 'desc' });
  const sorted = useSortedRows(view.holdings, COLUMNS, sort, (left, right) => left.id - right.id);
  const pagination = usePagination(sorted, PAGE_SIZE, `${sort.columnKey}:${sort.direction}`);
  const unclassifiedIds = useMemo(
    () => view.holdings.filter((row) => row.assetClass === null).map((row) => row.id),
    [view.holdings],
  );
  const selectedIds = view.holdings.filter((row) => selected.has(row.id)).map((row) => row.id);
  const toggle = (id: number, next: boolean) =>
    setSelected((previous) => {
      const copy = new Set(previous);
      if (next) copy.add(id);
      else copy.delete(id);
      return copy;
    });

  return (
    <DataTable
      title="Holdings"
      subtitle="Weight is each holding's share of your investments"
      toolbar={
        <BulkBar
          selectedIds={selectedIds}
          unclassifiedIds={unclassifiedIds}
          onSelect={(ids) => setSelected(new Set(ids))}
          onClear={() => setSelected(new Set())}
          classify={classify}
        />
      }
      columns={COLUMNS}
      sort={sort}
      onSortChange={setSort}
      density="default"
      tableLayout="fixed"
      minWidth={760}
      footer={
        view.holdings.length > PAGE_SIZE ? (
          <Pagination
            page={pagination.safeCurrentPage}
            totalPages={pagination.totalPages}
            rangeStart={pagination.rangeStart}
            rangeEnd={pagination.rangeEnd}
            totalCount={view.holdings.length}
            onChange={pagination.handlePageChange}
          />
        ) : undefined
      }
    >
      {pagination.pageItems.map((row) => (
        <HoldingTableRow
          key={row.id}
          row={row}
          view={view}
          format={format}
          selected={selected.has(row.id)}
          busy={classify.isPending}
          onToggle={(next) => toggle(row.id, next)}
          onUse={(assetClass) => classify.mutate([{ id: row.id, assetClass }])}
        />
      ))}
    </DataTable>
  );
}
