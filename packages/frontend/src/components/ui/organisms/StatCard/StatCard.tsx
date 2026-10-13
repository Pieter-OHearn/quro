import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { ArrowRight, CircleHelp } from 'lucide-react';
import { Link } from 'react-router';
import { cn } from '@/lib/utils';

// The icon tile and its tint are gone; `icon`, `color` and `layout` stay for existing callers.
type StatCardColor = 'indigo' | 'emerald' | 'sky' | 'amber' | 'rose';

const MINUS_SIGN = '\u2212';
// Same look as the `Change` atom: tabular 13px figures in the gain, loss or flat colour.
const CHANGE_CLASS_NAME = 'text-cell font-medium font-numeric';
const CARD_CLASS_NAME = 'block rounded-lg border border-border-default bg-surface px-4 py-3';

export type StatCardProps = {
  label: string;
  value: string;
  subtitle?: ReactNode;
  layout?: 'stacked' | 'inline';
  icon: LucideIcon;
  color: StatCardColor;
  change?: { value: string; positive: boolean; details?: string };
  href?: string;
  className?: string;
  testId?: string;
  valueClassName?: string;
};

type StatCardContentProps = Pick<
  StatCardProps,
  'label' | 'value' | 'subtitle' | 'change' | 'href' | 'valueClassName'
>;

type ChangeText = { text: string; tone: 'text-gain' | 'text-loss' | 'text-flat' };

/**
 * `change.value` arrives formatted, so the zero rule is applied to its text: a change whose
 * first figure is all zeros reads without a sign in the flat colour, and a leading hyphen
 * becomes a true minus sign.
 */
function describeChangeText({ value, positive }: NonNullable<StatCardProps['change']>): ChangeText {
  const firstFigure = value.match(/\d[\d.,\s\u00a0\u202f']*/)?.[0] ?? '';
  if (firstFigure && !/[1-9]/.test(firstFigure)) {
    return { text: value.replace(/^\s*[+\-\u2212]\s*/, ''), tone: 'text-flat' };
  }
  return {
    text: value.replace(/^(\s*)-/, `$1${MINUS_SIGN}`),
    tone: positive ? 'text-gain' : 'text-loss',
  };
}

function StatCardChange({ change }: { change: NonNullable<StatCardProps['change']> }) {
  const { text, tone } = describeChangeText(change);
  return (
    <span
      className={cn('group/trend relative inline-flex items-center gap-1', CHANGE_CLASS_NAME, tone)}
    >
      <span>{text}</span>
      {change.details && <CircleHelp size={12} className="text-fg-faint" aria-hidden />}
      {change.details && <span className="sr-only">{change.details}</span>}
      {change.details && (
        // Not laid out until hovered, so the 256px tooltip cannot widen the page on a phone.
        <span
          aria-hidden
          className="pointer-events-none absolute left-0 top-full z-30 mt-1 hidden w-64 rounded-md bg-surface-inverse px-2 py-1 text-caption text-fg-on-inverse shadow-popover group-hover/trend:block"
        >
          {change.details}
        </span>
      )}
    </span>
  );
}

/** Label, then the figure, then the change and an optional caption. */
function StatCardContent({
  label,
  value,
  subtitle,
  change,
  href,
  valueClassName,
}: StatCardContentProps) {
  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-label text-fg-muted">{label}</p>
        {href && (
          <ArrowRight
            size={14}
            className="shrink-0 text-fg-faint transition-colors duration-fast group-hover:text-fg-muted"
            aria-hidden
          />
        )}
      </div>
      <p className={cn('mt-1 text-figure-lg text-fg', valueClassName)}>{value}</p>
      {change || subtitle ? (
        <div className="mt-1 flex flex-wrap items-baseline gap-x-1.5">
          {change && <StatCardChange change={change} />}
          {subtitle && <div className="text-caption text-fg-subtle">{subtitle}</div>}
        </div>
      ) : null}
    </>
  );
}

export function StatCard({
  label,
  value,
  subtitle,
  change,
  href,
  className,
  testId,
  valueClassName,
}: StatCardProps) {
  const contentProps = { label, value, subtitle, change, href, valueClassName };
  if (href) {
    return (
      <Link
        to={href}
        data-testid={testId}
        className={cn(
          CARD_CLASS_NAME,
          'group transition-colors duration-fast hover:bg-surface-muted active:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus-ring',
          className,
        )}
      >
        <StatCardContent {...contentProps} />
      </Link>
    );
  }
  return (
    <div data-testid={testId} className={cn(CARD_CLASS_NAME, className)}>
      <StatCardContent {...contentProps} />
    </div>
  );
}
