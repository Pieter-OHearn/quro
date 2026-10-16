import { useId } from 'react';
import { cn } from '@/lib/utils';
import type { ChartAlternative } from './chartAlternative';

/**
 * The exact plotted values as a table behind a "Show values" disclosure: keyboard, touch and
 * screen reader users read the numbers the chart draws, including negative, missing and
 * estimated ones, without hovering.
 */
export function ChartDataTable({ alternative }: Readonly<{ alternative: ChartAlternative }>) {
  const captionId = useId();
  if (alternative.rows.length === 0) return null;
  return (
    <details className="group mt-3 border-t border-border-subtle pt-1">
      <summary className="flex min-h-7 cursor-pointer list-none items-center gap-1 rounded-sm text-caption font-medium text-brand-fg focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus-ring max-sm:min-h-11 [&::-webkit-details-marker]:hidden">
        <span aria-hidden className="text-fg-subtle transition-transform group-open:rotate-90">
          ›
        </span>
        Show values
        <span className="font-normal text-fg-subtle">({alternative.rows.length})</span>
      </summary>
      <div
        role="region"
        aria-labelledby={captionId}
        // A scrollable region is focusable, so the keyboard can scroll it.
        tabIndex={0}
        className="mt-1 max-h-64 overflow-auto rounded-sm focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus-ring"
      >
        <table className="w-full border-collapse text-cell">
          <caption id={captionId} className="sr-only">
            {alternative.caption}
          </caption>
          <thead className="sticky top-0 bg-surface">
            <tr className="border-b border-border-default">
              {alternative.columns.map((column, index) => (
                <th
                  key={`${index}-${column.label}`}
                  scope="col"
                  className={cn(
                    'h-7 whitespace-nowrap px-2 text-caption font-medium text-fg-muted',
                    column.align === 'right' ? 'text-right' : 'text-left',
                  )}
                >
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {alternative.rows.map((row) => (
              <tr key={row.key} className="border-b border-border-subtle last:border-b-0">
                {row.cells.map((cell, index) => {
                  const column = alternative.columns[index];
                  const content = cell === '' ? <span className="sr-only">Actual</span> : cell;
                  return index === 0 ? (
                    <th
                      key={`${index}-${column.label}`}
                      scope="row"
                      className="h-7 whitespace-nowrap px-2 text-left font-normal text-fg"
                    >
                      {content}
                    </th>
                  ) : (
                    <td
                      key={`${index}-${column.label}`}
                      className={cn(
                        'h-7 whitespace-nowrap px-2 text-fg',
                        column.align === 'right' ? 'text-right font-numeric' : 'text-left',
                      )}
                    >
                      {content}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {alternative.note ? (
        <p className="mt-1 text-caption text-fg-subtle">{alternative.note}</p>
      ) : null}
    </details>
  );
}
