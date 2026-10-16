import { useState } from 'react';
import type { CsvImportPreview, CsvPreviewRow, CsvRowStatus } from '@quro/shared';
import { Badge, Button, Change, SegmentedControl } from '@/components/ui';
import { cn } from '@/lib/utils';
import { ReconciliationCard } from './ReconciliationCard';

const PAGE_ROWS = 100;

const STATUS_LABEL: Record<CsvRowStatus, string> = {
  ready: 'Ready',
  duplicate: 'Already imported',
  possibleDuplicate: 'Possible duplicate',
  skipped: 'Skipped',
  error: 'Error',
};

const STATUS_TONE: Record<CsvRowStatus, 'success' | 'neutral' | 'warning' | 'info'> = {
  ready: 'success',
  duplicate: 'neutral',
  possibleDuplicate: 'warning',
  skipped: 'neutral',
  error: 'warning',
};

type Props = {
  preview: CsvImportPreview;
  currency: string;
  selected: ReadonlySet<number>;
  onSelect: (selected: ReadonlySet<number>) => void;
  saveProfile: boolean;
  onSaveProfile: (value: boolean) => void;
};

const importable = (row: CsvPreviewRow) =>
  row.status === 'ready' || row.status === 'possibleDuplicate';

function Summary({ preview }: Readonly<{ preview: CsvImportPreview }>) {
  const { summary } = preview;
  const parts: [string, number][] = [
    ['ready', summary.ready],
    ['already imported', summary.duplicate],
    ['possible duplicates', summary.possibleDuplicate],
    ['skipped', summary.skipped],
    ['with errors', summary.error],
  ];
  return (
    <p className="text-cell text-fg-muted">
      {summary.totalRows} rows:{' '}
      {parts
        .filter(([, count]) => count > 0)
        .map(([label, count]) => `${count} ${label}`)
        .join(', ')}
      . Only checked rows are imported.
    </p>
  );
}

type RowProps = {
  row: CsvPreviewRow;
  checked: boolean;
  onToggle: () => void;
};

function PreviewRow({ row, checked, onToggle }: Readonly<RowProps>) {
  const canImport = importable(row);
  return (
    <li
      className={cn(
        'grid grid-cols-[auto_1fr_auto] items-start gap-x-3 gap-y-0.5 border-t border-border-subtle px-3 py-2 first:border-t-0 max-sm:min-h-11',
        !canImport && 'text-fg-subtle',
      )}
    >
      <input
        type="checkbox"
        aria-label={`Import row ${row.rowNumber}`}
        checked={checked}
        disabled={!canImport}
        onChange={onToggle}
        className="mt-0.5 h-4 w-4 rounded-sm border-border-control focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus-ring"
      />
      <span className="min-w-0 text-cell">
        <span className="block truncate text-fg">{row.description ?? `Row ${row.rowNumber}`}</span>
        <span className="block text-caption text-fg-subtle">
          {row.date ?? `Line ${row.line}`}
          {row.category ? ` · ${row.category}` : ''}
        </span>
      </span>
      <span className="text-right">
        {row.amount !== null && row.currency ? (
          <Change value={row.amount} format="amount" currency={row.currency} showArrow={false} />
        ) : null}
      </span>
      <span />
      <span className="col-span-2 flex flex-wrap items-center gap-1.5">
        <Badge tone={STATUS_TONE[row.status]}>{STATUS_LABEL[row.status]}</Badge>
        {row.reason ? <span className="text-caption text-fg-subtle">{row.reason}</span> : null}
        {row.formulaLike ? <Badge tone="info">Starts with a formula character</Badge> : null}
      </span>
    </li>
  );
}

export function ReviewStep({
  preview,
  currency,
  selected,
  onSelect,
  saveProfile,
  onSaveProfile,
}: Readonly<Props>) {
  const [filter, setFilter] = useState<'attention' | 'all'>(
    preview.summary.ready === preview.summary.totalRows ? 'all' : 'attention',
  );
  const [shown, setShown] = useState(PAGE_ROWS);
  const rows = preview.rows.filter((row) => filter === 'all' || row.status !== 'ready');
  const toggle = (rowNumber: number) => {
    const next = new Set(selected);
    if (!next.delete(rowNumber)) next.add(rowNumber);
    onSelect(next);
  };

  return (
    <div className="space-y-3">
      <Summary preview={preview} />
      {preview.warnings.map((warning) => (
        <p
          key={warning}
          role="status"
          className="rounded-lg border border-warning bg-warning-soft p-3 text-cell text-warning"
        >
          {warning}
        </p>
      ))}
      {preview.reconciliation ? (
        <ReconciliationCard reconciliation={preview.reconciliation} currency={currency} predicted />
      ) : null}
      <SegmentedControl
        aria-label="Rows to show"
        variant="soft"
        value={filter}
        onChange={(value) => {
          setFilter(value as 'attention' | 'all');
          setShown(PAGE_ROWS);
        }}
        options={[
          { value: 'attention', label: 'Needs a look' },
          { value: 'all', label: `All ${preview.rows.length} rows` },
        ]}
      />
      <ul className="rounded-lg border border-border-default">
        {rows.slice(0, shown).map((row) => (
          <PreviewRow
            key={row.rowNumber}
            row={row}
            checked={selected.has(row.rowNumber)}
            onToggle={() => toggle(row.rowNumber)}
          />
        ))}
        {rows.length === 0 ? (
          <li className="px-3 py-2 text-cell text-fg-subtle">Every row is ready.</li>
        ) : null}
      </ul>
      {rows.length > shown ? (
        <Button variant="secondary" size="sm" onClick={() => setShown(shown + PAGE_ROWS)}>
          Show more rows
        </Button>
      ) : null}
      <label className="flex items-center gap-2 text-cell text-fg max-sm:min-h-11">
        <input
          type="checkbox"
          checked={saveProfile}
          onChange={(event) => onSaveProfile(event.target.checked)}
          className="h-4 w-4 rounded-sm border-border-control focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus-ring"
        />
        Remember this column mapping for the source
      </label>
    </div>
  );
}
