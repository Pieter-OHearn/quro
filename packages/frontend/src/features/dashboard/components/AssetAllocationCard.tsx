import { useId, type CSSProperties } from 'react';
import { Link } from 'react-router';
import { Card, PanelHeader } from '@/components/ui';
import { cn } from '@/lib/utils';
import type { AllocationItem, DashboardFormatFn } from '../types';

const MINUS_SIGN = '−';
const DEBT_COLOR = 'var(--viz-6)';
const ROW_CLASS_NAME = 'flex h-7 items-center gap-2 text-cell';

const swatchStyle = (color: string): CSSProperties => ({ backgroundColor: color });

const formatShare = (value: number, total: number): string =>
  `${total > 0 ? ((value / total) * 100).toFixed(0) : 0}%`;

/** An 8px bar split by asset class, in the same colours as the rows below it. */
function AllocationBar({
  data,
  totalAlloc,
}: Readonly<{ data: readonly AllocationItem[]; totalAlloc: number }>) {
  if (totalAlloc <= 0) return null;
  return (
    <div className="mb-3 flex h-2 gap-px overflow-hidden rounded-full" aria-hidden>
      {data.map((item) =>
        item.value > 0 ? (
          <div
            key={item.key}
            className="h-full"
            style={{ ...swatchStyle(item.color), width: `${(item.value / totalAlloc) * 100}%` }}
          />
        ) : null,
      )}
    </div>
  );
}

function Swatch({ color }: Readonly<{ color: string }>) {
  return <span className="size-2 shrink-0 rounded-sm" style={swatchStyle(color)} aria-hidden />;
}

function AllocationRows({
  data,
  totalAlloc,
  fmtBase,
}: Readonly<{
  data: readonly AllocationItem[];
  totalAlloc: number;
  fmtBase: DashboardFormatFn;
}>) {
  const summaryId = useId();
  const largest = data.reduce<AllocationItem | null>(
    (top, item) => (top === null || item.value > top.value ? item : top),
    null,
  );
  return (
    <>
      <p id={summaryId} className="sr-only">
        {largest
          ? `${data.length} asset classes. Largest: ${largest.name}, ${formatShare(largest.value, totalAlloc)} of assets. Each row lists the exact value and its share of assets.`
          : 'No asset classes.'}
      </p>
      <ul aria-label="Asset allocation by class" aria-describedby={summaryId}>
        {data.map((item) => (
          <li key={item.key} className={ROW_CLASS_NAME}>
            <Swatch color={item.color} />
            <span className="min-w-0 flex-1 truncate text-fg">{item.name}</span>
            <span className="font-numeric text-fg">{fmtBase(item.value)}</span>
            <span className="w-9 text-right font-numeric text-fg-muted">
              {formatShare(item.value, totalAlloc)}
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}

function LiabilitiesRow({
  liabilitiesTotal,
  debtCount,
  fmtBase,
}: Readonly<{ liabilitiesTotal: number; debtCount: number; fmtBase: DashboardFormatFn }>) {
  return (
    <Link
      to="/debts"
      className={cn(
        ROW_CLASS_NAME,
        '-mx-1 rounded-sm px-1 transition-colors duration-fast hover:bg-surface-muted active:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus-ring max-sm:h-11',
      )}
    >
      <Swatch color={DEBT_COLOR} />
      <span className="min-w-0 flex-1 truncate text-fg">
        Liabilities{' '}
        <span className="text-caption text-fg-subtle">
          · {debtCount} active debt{debtCount === 1 ? '' : 's'}
        </span>
      </span>
      <span className="font-numeric text-fg">
        {MINUS_SIGN}
        {fmtBase(liabilitiesTotal)}
      </span>
      <span className="w-9" aria-hidden />
    </Link>
  );
}

export function AssetAllocationCard({
  allocationData,
  totalAlloc,
  liabilitiesTotal,
  debtCount,
  netWorth,
  baseCurrency,
  fmtBase,
}: Readonly<{
  allocationData: readonly AllocationItem[];
  totalAlloc: number;
  liabilitiesTotal: number;
  debtCount: number;
  netWorth: number;
  baseCurrency: string;
  fmtBase: DashboardFormatFn;
}>) {
  const hasAssets = allocationData.length > 0;

  return (
    <Card padding="none" className="h-full overflow-hidden">
      <PanelHeader title="Asset allocation" subtitle={`All values in ${baseCurrency}`} />
      <div className="p-4">
        {hasAssets ? (
          <>
            <AllocationBar data={allocationData} totalAlloc={totalAlloc} />
            <AllocationRows data={allocationData} totalAlloc={totalAlloc} fmtBase={fmtBase} />
          </>
        ) : (
          <p className="py-8 text-cell text-fg-subtle">No asset allocation data yet.</p>
        )}
        {liabilitiesTotal > 0 ? (
          <LiabilitiesRow
            liabilitiesTotal={liabilitiesTotal}
            debtCount={debtCount}
            fmtBase={fmtBase}
          />
        ) : null}
        {hasAssets || liabilitiesTotal > 0 ? (
          <div className={cn(ROW_CLASS_NAME, 'mt-1 border-t border-border-strong font-semibold')}>
            <span className="flex-1 text-fg">Net worth</span>
            <span className="font-numeric text-fg">{fmtBase(netWorth)}</span>
            <span className="w-9" aria-hidden />
          </div>
        ) : null}
      </div>
    </Card>
  );
}
