import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import { cn } from '@/lib/utils';

const WRAPPER_CLASSES = {
  pill: 'flex items-center gap-2 flex-wrap',
  contained:
    'flex items-center gap-1.5 bg-surface border border-border-default rounded-xl p-1 flex-wrap',
  soft: 'flex items-center gap-1 flex-wrap',
  underline: 'flex border-b border-border-subtle',
} as const;

const BUTTON_CLASSES = {
  pill: 'inline-flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-medium transition-all',
  contained:
    'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all',
  soft: 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs transition-colors',
  underline:
    'flex flex-1 min-w-0 items-center justify-center gap-2 border-b-2 border-transparent py-4 text-sm font-medium transition-colors',
} as const;

const PILL_ACTIVE_TONE_CLASSES = {
  dark: 'bg-surface-inverse text-fg-inverted border-surface-inverse shadow-card',
  indigo: 'bg-brand text-fg-inverted border-brand shadow-brand',
} as const;

const PILL_INACTIVE_TONE_CLASSES = {
  dark: 'bg-surface border-border-default text-fg-muted hover:bg-surface-sunken',
  indigo:
    'bg-surface border-border-default text-fg-muted hover:border-brand-border hover:text-brand',
} as const;

const ACTIVE_CLASSES = {
  contained: 'bg-brand text-fg-inverted shadow-card',
  soft: 'bg-brand-soft-strong text-brand-fg font-medium',
  underline: 'border-brand bg-brand-soft/40 text-brand',
} as const;

const INACTIVE_CLASSES = {
  contained: 'text-fg-muted hover:bg-surface-sunken',
  soft: 'text-fg-subtle hover:bg-surface-muted',
  underline: 'text-fg-subtle hover:text-fg-strong',
} as const;

type SegmentedControlVariant = keyof typeof WRAPPER_CLASSES;
type SegmentedControlTone = keyof typeof PILL_ACTIVE_TONE_CLASSES;

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

function getActiveClassName(variant: SegmentedControlVariant, tone: SegmentedControlTone) {
  if (variant === 'pill') {
    return PILL_ACTIVE_TONE_CLASSES[tone];
  }

  return ACTIVE_CLASSES[variant];
}

export function SegmentedControl<T extends string | number>({
  options,
  value,
  onChange,
  variant = 'pill',
  tone = 'indigo',
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
              isActive
                ? getActiveClassName(variant, tone)
                : variant === 'pill'
                  ? PILL_INACTIVE_TONE_CLASSES[tone]
                  : INACTIVE_CLASSES[variant],
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
