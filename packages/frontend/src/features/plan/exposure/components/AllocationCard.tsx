import { type ExposureGroupRow, type ExposureView, type MixGroup } from '@quro/shared';
import { ChartCard, buildChartAlternative } from '@/components/ui';
import { cn } from '@/lib/utils';
import { GROUP_BAR_CLASS, MIN_VISIBLE_SHARE } from '../exposureStyle';
import type { ExposureFormat } from '../useExposureFormat';

type Segment = {
  key: MixGroup | 'unclassified';
  label: string;
  share: number;
  value: number;
};

function segmentsOf(view: ExposureView): Segment[] {
  const segments: Segment[] = view.groups.map((group) => ({
    key: group.key,
    label: group.label,
    share: group.share,
    value: group.value,
  }));
  segments.push({
    key: 'unclassified',
    label: 'Unclassified',
    share: view.unclassified.share,
    value: view.unclassified.value,
  });
  return segments;
}

function StackedBar({ segments }: Readonly<{ segments: readonly Segment[] }>) {
  return (
    <div className="flex h-5 w-full gap-px overflow-hidden rounded-md bg-surface-muted" aria-hidden>
      {segments
        .filter((segment) => segment.share > 0)
        .map((segment) => (
          <div
            key={segment.key}
            className={cn('h-full', GROUP_BAR_CLASS[segment.key])}
            style={{ width: `${Math.max(MIN_VISIBLE_SHARE, segment.share)}%` }}
          />
        ))}
    </div>
  );
}

function Legend({
  segments,
  format,
}: Readonly<{ segments: readonly Segment[]; format: ExposureFormat }>) {
  return (
    <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-cell sm:grid-cols-3 lg:grid-cols-5">
      {segments.map((segment) => (
        <li key={segment.key} className="flex items-center gap-2">
          <span
            aria-hidden
            className={cn('h-2.5 w-2.5 shrink-0 rounded-sm', GROUP_BAR_CLASS[segment.key])}
          />
          <span className="min-w-0 truncate text-fg-muted">{segment.label}</span>
          <span className="ml-auto font-numeric text-fg">{format.percent(segment.share)}</span>
        </li>
      ))}
    </ul>
  );
}

const STATUS_TEXT = {
  below: 'Below the range',
  within: 'Within the range',
  above: 'Above the range',
} as const;

function ReferenceRow({
  group,
  format,
}: Readonly<{ group: ExposureGroupRow; format: ExposureFormat }>) {
  const reference = group.reference!;
  return (
    <li className="grid grid-cols-[6.5rem_1fr] items-center gap-x-3 gap-y-0.5 sm:grid-cols-[7.5rem_1fr_11rem]">
      <span className="text-cell text-fg-muted">{group.label}</span>
      <div className="relative h-4" aria-hidden>
        <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-surface-muted" />
        <div
          className={cn(
            'absolute left-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full',
            GROUP_BAR_CLASS[group.key],
          )}
          style={{ width: `${Math.max(group.share > 0 ? MIN_VISIBLE_SHARE : 0, group.share)}%` }}
        />
        <div
          className="absolute top-0 h-4 rounded-sm border-2 border-fg"
          style={{
            left: `${reference.min}%`,
            width: `${Math.max(1, reference.max - reference.min)}%`,
          }}
        />
      </div>
      <p className="col-span-2 text-caption text-fg-subtle sm:col-span-1 sm:text-cell">
        <span className="font-numeric text-fg">{format.percent(group.share)}</span> ·{' '}
        <span className="font-numeric">
          {reference.min}–{reference.max}%
        </span>{' '}
        · {STATUS_TEXT[reference.status]}
      </p>
    </li>
  );
}

function ReferenceComparison({
  view,
  format,
}: Readonly<{ view: ExposureView; format: ExposureFormat }>) {
  if (!view.referenceMix) return null;
  return (
    <div className="mt-4 border-t border-border-subtle pt-3">
      <h4 className="text-label text-fg-muted">
        Compared with {view.referenceMix.name}{' '}
        <span className="font-normal text-fg-subtle">(outlined box: the range)</span>
      </h4>
      <ul className="mt-2 space-y-2">
        {view.groups.map((group) => (
          <ReferenceRow key={group.key} group={group} format={format} />
        ))}
      </ul>
    </div>
  );
}

/** One stacked bar for the mix, a legend with the shares, and the selected reference ranges. */
export function AllocationCard({
  view,
  format,
}: Readonly<{ view: ExposureView; format: ExposureFormat }>) {
  const segments = segmentsOf(view).filter(
    (segment) => segment.share > 0 || segment.key !== 'unclassified',
  );
  const alternative = buildChartAlternative({
    subject: 'Investments by group',
    xLabel: 'Group',
    ordered: false,
    x: (segment: Segment) => segment.label,
    rows: segments,
    columns: [
      { label: 'Share', value: (s) => s.share, format: format.percent },
      { label: 'Value', value: (s) => s.value, format: format.money },
    ],
    summary: `Investments by group: ${segments
      .map((segment) => `${segment.label} ${format.percent(segment.share)}`)
      .join(', ')}.${view.referenceStatement ? ` ${view.referenceStatement}` : ''}`,
  });
  return (
    <ChartCard
      title="Mix by group"
      subtitle={
        view.referenceMix
          ? `Shares of your investments, with the range of ${view.referenceMix.name}`
          : 'Shares of your investments'
      }
      hasData
      alternative={alternative}
    >
      <StackedBar segments={segments} />
      <Legend segments={segments} format={format} />
      <ReferenceComparison view={view} format={format} />
    </ChartCard>
  );
}
