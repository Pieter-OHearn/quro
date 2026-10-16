import type { ComponentPropsWithoutRef, KeyboardEvent, ReactNode } from 'react';
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
  'bg-surface text-fg-muted hover:bg-surface-muted active:bg-surface-muted disabled:bg-surface';

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

/** The id of the tab for `value` in an underline control with the given `tabsId`. */
export function segmentedTabId(tabsId: string, value: string | number): string {
  return `${tabsId}-tab-${value}`;
}

/** The id the panel shown for `value` must carry (with `role="tabpanel"`) in an underline control. */
export function segmentedPanelId(tabsId: string, value: string | number): string {
  return `${tabsId}-panel-${value}`;
}

/**
 * The enabled option an arrow, Home or End key moves to, wrapping around the ends; `null` for any
 * other key.
 */
export function nextTabIndex(
  key: string,
  current: number,
  disabled: readonly boolean[],
): number | null {
  const count = disabled.length;
  let start: number;
  let direction: 1 | -1;
  if (key === 'ArrowRight' || key === 'ArrowDown') {
    start = current;
    direction = 1;
  } else if (key === 'ArrowLeft' || key === 'ArrowUp') {
    start = current;
    direction = -1;
  } else if (key === 'Home') {
    start = -1;
    direction = 1;
  } else if (key === 'End') {
    start = count;
    direction = -1;
  } else {
    return null;
  }
  for (let offset = 1; offset <= count; offset += 1) {
    const index = (((start + direction * offset) % count) + count) % count;
    if (!disabled[index]) return index;
  }
  return null;
}

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
  buttonClassName?: string;
  /**
   * Underline tabs only. Gives each tab the id `segmentedTabId(tabsId, value)` and points it at
   * the panel `segmentedPanelId(tabsId, value)`, which the page renders for the selected tab.
   */
  tabsId?: string;
};

type OptionAttributesInput = {
  isTabs: boolean;
  tabsId?: string;
  value: string | number;
  isActive: boolean;
  inTabOrder: boolean;
};

// Underline tabs are `role="tab"` with one tab in the Tab order; the other variants are toggle
// buttons.
function optionAttributes({ isTabs, tabsId, value, isActive, inTabOrder }: OptionAttributesInput) {
  if (!isTabs) return { 'aria-pressed': isActive };
  return {
    role: 'tab',
    'aria-selected': isActive,
    tabIndex: inTabOrder ? undefined : -1,
    id: tabsId ? segmentedTabId(tabsId, value) : undefined,
    'aria-controls': tabsId ? segmentedPanelId(tabsId, value) : undefined,
  };
}

// A selection made elsewhere (a link to `?tab=data`, an arrow key) can be an option that the
// scrolled group has clipped, so the group scrolls it into view. Only the group moves, not the
// page, and only when the selection has changed since the group last did so.
function revealSelection(group: HTMLDivElement | null, value: string | number) {
  if (!group || group.dataset.revealed === String(value)) return;
  group.dataset.revealed = String(value);
  const selected = group.querySelector<HTMLElement>(
    '[aria-selected="true"], [aria-pressed="true"]',
  );
  if (!selected || group.scrollWidth <= group.clientWidth) return;
  const groupBox = group.getBoundingClientRect();
  const box = selected.getBoundingClientRect();
  if (box.left >= groupBox.left && box.right <= groupBox.right) return;
  group.scrollLeft += box.left - groupBox.left - (group.clientWidth - box.width) / 2;
}

export function SegmentedControl<T extends string | number>({
  options,
  value,
  onChange,
  variant = 'pill',
  className,
  buttonClassName,
  tabsId,
  ...props
}: SegmentedControlProps<T>) {
  const isTabs = variant === 'underline';
  const hasSelection = options.some((option) => option.value === value);

  // Tabs follow the arrow-key pattern: one tab is in the Tab order, the arrows move the selection
  // and focus together, and Home and End jump to the ends.
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const current = options.findIndex((option) => option.value === value);
    const next = nextTabIndex(
      event.key,
      current,
      options.map((option) => Boolean(option.disabled)),
    );
    if (next === null || next === current) return;
    event.preventDefault();
    onChange(options[next].value);
    event.currentTarget.querySelectorAll<HTMLElement>('[role="tab"]')[next]?.focus();
  };

  return (
    <div
      ref={(group) => revealSelection(group, value)}
      role={isTabs ? 'tablist' : 'group'}
      className={cn(WRAPPER_CLASSES[variant], className)}
      onKeyDown={isTabs ? handleKeyDown : undefined}
      {...props}
    >
      {options.map((option) => {
        const isActive = option.value === value;

        return (
          <button
            key={String(option.value)}
            type="button"
            {...optionAttributes({
              isTabs,
              tabsId,
              value: option.value,
              isActive,
              inTabOrder: isActive || (!hasSelection && option === options[0]),
            })}
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
