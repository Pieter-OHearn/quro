import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import { cn } from '@/lib/utils';

// `pill`, `contained` and `soft` all render the joined segmented control: one bordered group,
// 28px high on desktop, with 44px options that share the width on phones. The selected option
// is a `brand-soft` tint, never a fill, because a `brand` fill is kept for the one action button
// of a view. `underline` renders tabs whose selection is a 2px `brand` underline. A group wider
// than its container scrolls sideways instead of wrapping or hiding options.
const SEGMENTED_WRAPPER_CLASS_NAME =
  'inline-flex max-w-full overflow-x-auto rounded-md border border-border-control max-sm:flex';

// The focus outline is drawn inside the option because the wrapper clips its corners.
const SEGMENTED_BUTTON_CLASS_NAME =
  'inline-flex h-[26px] shrink-0 items-center justify-center gap-1.5 border-r border-border-control px-2.5 text-label whitespace-nowrap transition-colors duration-fast last:border-r-0 max-sm:h-11 max-sm:flex-1 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus-ring disabled:cursor-not-allowed disabled:text-fg-subtle';

const SEGMENTED_ACTIVE_CLASS_NAME = 'bg-brand-soft font-semibold text-brand-fg';
const SEGMENTED_INACTIVE_CLASS_NAME =
  'bg-surface text-fg-muted hover:bg-surface-muted active:bg-surface-muted';

const WRAPPER_CLASSES = {
  pill: SEGMENTED_WRAPPER_CLASS_NAME,
  contained: SEGMENTED_WRAPPER_CLASS_NAME,
  soft: SEGMENTED_WRAPPER_CLASS_NAME,
  underline: 'flex border-b border-border-default',
} as const;

const BUTTON_CLASSES = {
  pill: SEGMENTED_BUTTON_CLASS_NAME,
  contained: SEGMENTED_BUTTON_CLASS_NAME,
  soft: SEGMENTED_BUTTON_CLASS_NAME,
  underline:
    '-mb-px flex h-9 min-w-0 flex-1 items-center justify-center gap-1.5 border-b-2 border-transparent px-3 text-cell font-medium transition-colors duration-fast max-sm:h-11 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus-ring disabled:cursor-not-allowed disabled:text-fg-subtle',
} as const;

const ACTIVE_CLASSES = {
  pill: SEGMENTED_ACTIVE_CLASS_NAME,
  contained: SEGMENTED_ACTIVE_CLASS_NAME,
  soft: SEGMENTED_ACTIVE_CLASS_NAME,
  underline: 'border-brand font-semibold text-fg',
} as const;

const INACTIVE_CLASSES = {
  pill: SEGMENTED_INACTIVE_CLASS_NAME,
  contained: SEGMENTED_INACTIVE_CLASS_NAME,
  soft: SEGMENTED_INACTIVE_CLASS_NAME,
  underline: 'text-fg-muted hover:text-fg active:text-fg',
} as const;

type SegmentedControlVariant = keyof typeof WRAPPER_CLASSES;
// Both tones render the same `brand-soft` selection; the prop stays for existing callers.
type SegmentedControlTone = 'dark' | 'indigo';

export type SegmentedControlOption<T extends string | number> = {
  value: T;
  label: ReactNode;
  icon?: ReactNode;
  badge?: ReactNode;
  disabled?: boolean;
  className?: string;
};

export type SegmentedControlProps<T extends string | number> = Omit<
  ComponentPropsWithoutRef<'div'>,
  'onChange'
> & {
  options: readonly SegmentedControlOption<T>[];
  value: T;
  onChange: (value: T) => void;
  variant?: SegmentedControlVariant;
  tone?: SegmentedControlTone;
  buttonClassName?: string;
};

export function SegmentedControl<T extends string | number>({
  options,
  value,
  onChange,
  variant = 'pill',
  tone: _tone,
  className,
  buttonClassName,
  ...props
}: SegmentedControlProps<T>) {
  return (
    <div
      role={variant === 'underline' ? 'tablist' : 'group'}
      className={cn(WRAPPER_CLASSES[variant], className)}
      {...props}
    >
      {options.map((option) => {
        const isActive = option.value === value;

        return (
          <button
            key={String(option.value)}
            type="button"
            role={variant === 'underline' ? 'tab' : undefined}
            aria-selected={variant === 'underline' ? isActive : undefined}
            aria-pressed={variant === 'underline' ? undefined : isActive}
            disabled={option.disabled}
            onClick={() => onChange(option.value)}
            className={cn(
              BUTTON_CLASSES[variant],
              isActive ? ACTIVE_CLASSES[variant] : INACTIVE_CLASSES[variant],
              option.className,
              buttonClassName,
            )}
          >
            {option.icon}
            <span className="min-w-0 truncate">{option.label}</span>
            {option.badge}
          </button>
        );
      })}
    </div>
  );
}
