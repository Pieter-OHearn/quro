import { useId, useState, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { ArrowRight, CircleHelp } from 'lucide-react';
import { Link } from 'react-router';
import { cn } from '@/lib/utils';
import { Change, type ChangeProps } from '../../atoms';

// The icon tile and its tint are gone; `icon`, `color` and `layout` stay for existing callers.
type StatCardColor = 'indigo' | 'emerald' | 'sky' | 'amber' | 'rose';

const MINUS_SIGN = '\u2212';
// Same look as the `Change` atom: tabular 13px figures in the gain, loss or flat colour.
const CHANGE_CLASS_NAME = 'text-cell font-medium font-numeric';
const CARD_CLASS_NAME =
  'block rounded-lg border border-border-default bg-surface px-4 py-3 max-sm:rounded-xl';

/** A change that arrives formatted; the zero rule and minus sign are applied to its text. */
export type StatCardTextChange = { value: string; positive: boolean; details?: string };

/**
 * A signed number rendered through the `Change` atom: `+`, a true minus or no sign for zero,
 * in the gain, loss or flat colour. `label` is a caption after the figure ("this month").
 */
export type StatCardNumericChange = {
  amount: number;
  label?: string;
  details?: string;
} & (
  { format: 'amount'; currency?: ChangeProps['currency'] } | { format: 'percent'; currency?: never }
);

export type StatCardChangeProp = StatCardTextChange | StatCardNumericChange;

export type StatCardProps = {
  label: string;
  value: string;
  subtitle?: ReactNode;
  layout?: 'stacked' | 'inline';
  icon: LucideIcon;
  color: StatCardColor;
  change?: StatCardChangeProp;
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
function describeChangeText({ value, positive }: StatCardTextChange): ChangeText {
  const firstFigure = value.match(/\d[\d.,\s\u00a0\u202f']*/)?.[0] ?? '';
  if (firstFigure && !/[1-9]/.test(firstFigure)) {
    return { text: value.replace(/^\s*[+\-\u2212]\s*/, ''), tone: 'text-flat' };
  }
  return {
    text: value.replace(/^(\s*)-/, `$1${MINUS_SIGN}`),
    tone: positive ? 'text-gain' : 'text-loss',
  };
}

function isNumericChange(change: StatCardChangeProp): change is StatCardNumericChange {
  return 'amount' in change;
}

// Not laid out until shown, so the 256px tooltip cannot widen the page on a phone.
const DETAILS_TOOLTIP_CLASS_NAME =
  'pointer-events-none absolute left-0 top-full z-30 mt-1 w-64 max-w-[calc(100vw-2rem)] rounded-md bg-surface-inverse px-2 py-1 text-caption text-fg-on-inverse shadow-popover';

/**
 * The help icon after a change and its tooltip, shown on hover and on keyboard focus. In a card
 * that is a link the card itself takes focus, so the tooltip follows the card's focus; otherwise
 * the icon is a button that also toggles the tooltip on a tap.
 */
function StatCardChangeDetails({ details, inLink }: { details: string; inLink: boolean }) {
  const tooltipId = useId();
  const [open, setOpen] = useState(false);

  if (inLink) {
    return (
      <>
        <CircleHelp size={12} className="text-fg-faint" aria-hidden />
        <span className="sr-only">{details}</span>
        <span
          aria-hidden
          className={cn(
            DETAILS_TOOLTIP_CLASS_NAME,
            'hidden group-hover/trend:block group-focus-visible:block',
          )}
        >
          {details}
        </span>
      </>
    );
  }

  return (
    <>
      <button
        type="button"
        aria-label="Change details"
        aria-describedby={tooltipId}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        onBlur={() => setOpen(false)}
        className="inline-flex self-center rounded-sm text-fg-faint transition-colors duration-fast hover:text-fg-muted active:text-fg-muted focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus-ring max-sm:-m-4 max-sm:p-4"
      >
        <CircleHelp size={12} aria-hidden />
      </button>
      <span
        id={tooltipId}
        role="tooltip"
        className={cn(
          DETAILS_TOOLTIP_CLASS_NAME,
          open ? 'block' : 'hidden group-hover/trend:block group-focus-within/trend:block',
        )}
      >
        {details}
      </span>
    </>
  );
}

function StatCardNumericChangeContent({ change }: { change: StatCardNumericChange }) {
  const figure =
    change.format === 'amount' ? (
      <Change value={change.amount} format="amount" currency={change.currency} />
    ) : (
      <Change value={change.amount} format="percent" />
    );
  return (
    <>
      {figure}
      {change.label && <span className="text-caption text-fg-subtle">{change.label}</span>}
    </>
  );
}

function StatCardChange({ change, inLink }: { change: StatCardChangeProp; inLink: boolean }) {
  if (isNumericChange(change)) {
    return (
      <span className="group/trend relative inline-flex items-baseline gap-1">
        <StatCardNumericChangeContent change={change} />
        {change.details && <StatCardChangeDetails details={change.details} inLink={inLink} />}
      </span>
    );
  }
  const { text, tone } = describeChangeText(change);
  return (
    <span
      className={cn('group/trend relative inline-flex items-center gap-1', CHANGE_CLASS_NAME, tone)}
    >
      <span>{text}</span>
      {change.details && <StatCardChangeDetails details={change.details} inLink={inLink} />}
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
          {change && <StatCardChange change={change} inLink={Boolean(href)} />}
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
