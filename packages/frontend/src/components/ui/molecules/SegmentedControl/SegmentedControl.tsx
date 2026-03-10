import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import { cn } from '@/lib/utils';

const WRAPPER_CLASSES = {
  pill: 'flex items-center gap-2 flex-wrap',
  contained: 'flex items-center gap-1.5 bg-white border border-slate-200 rounded-xl p-1 flex-wrap',
  soft: 'flex items-center gap-1 flex-wrap',
  underline: 'flex border-b border-slate-100',
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
  dark: 'bg-[#0a0f1e] text-white border-[#0a0f1e] shadow-sm',
  indigo: 'bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-600/20',
} as const;

const PILL_INACTIVE_TONE_CLASSES = {
  dark: 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50',
  indigo: 'bg-white border-slate-200 text-slate-600 hover:border-indigo-300 hover:text-indigo-600',
} as const;

const ACTIVE_CLASSES = {
  contained: 'bg-indigo-600 text-white shadow-sm',
  soft: 'bg-indigo-100 text-indigo-700 font-medium',
  underline: 'border-indigo-600 bg-indigo-50/40 text-indigo-600',
} as const;

const INACTIVE_CLASSES = {
  contained: 'text-slate-600 hover:bg-slate-50',
  soft: 'text-slate-500 hover:bg-slate-100',
  underline: 'text-slate-500 hover:text-slate-700',
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
