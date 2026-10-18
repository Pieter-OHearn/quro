import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { MIN_VISIBLE_SHARE } from '../exposureStyle';

export type BarListRow = {
  key: string;
  label: ReactNode;
  caption?: ReactNode;
  /** Percent of the invested total, 0 to 100. */
  share: number;
  shareText: string;
  valueText: string;
  barClassName: string;
};

/**
 * Horizontal bars for one breakdown. The label, the share and the value are text beside every bar,
 * so the colour is never the only signal; the card that holds it carries the text alternative.
 */
export function BarList({ rows }: Readonly<{ rows: readonly BarListRow[] }>) {
  return (
    <ul className="space-y-3">
      {rows.map((row) => (
        <li key={row.key}>
          <div className="flex items-baseline justify-between gap-3 text-cell">
            <span className="min-w-0 truncate font-medium text-fg">{row.label}</span>
            <span className="shrink-0 font-numeric text-fg">
              {row.shareText}
              <span className="ml-2 text-fg-subtle">{row.valueText}</span>
            </span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-muted" aria-hidden>
            <div
              className={cn('h-full rounded-full', row.barClassName)}
              style={{ width: `${Math.max(row.share > 0 ? MIN_VISIBLE_SHARE : 0, row.share)}%` }}
            />
          </div>
          {row.caption ? <p className="mt-0.5 text-caption text-fg-subtle">{row.caption}</p> : null}
        </li>
      ))}
    </ul>
  );
}
