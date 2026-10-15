import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Spinner } from '../Spinner';

const VARIANT_CLASSES = {
  primary:
    'bg-brand text-fg-inverted hover:bg-brand-hover active:bg-brand-hover disabled:bg-surface-muted disabled:text-fg-subtle',
  secondary:
    'border border-border-control bg-surface text-fg hover:bg-surface-muted active:bg-surface-muted disabled:bg-surface disabled:text-fg-subtle',
  danger:
    'border border-danger text-danger hover:bg-danger-soft active:bg-danger-soft disabled:border-border-default disabled:bg-transparent disabled:text-fg-subtle',
  // The confirm step of a destructive action, the only place a destructive button fills.
  dangerSolid:
    'border border-danger bg-danger text-fg-inverted enabled:hover:opacity-90 enabled:active:opacity-90 disabled:border-border-default disabled:bg-surface-muted disabled:text-fg-subtle',
  ghost:
    'text-fg hover:bg-surface-muted active:bg-surface-muted disabled:bg-transparent disabled:text-fg-subtle',
} as const;

// Height comes from `h-*`, at least 44px on phones; text uses the type scale (`cell` is the
// control style, the touch sizes take `body`, 15px on phones, and the 15px `title-section`).
const SIZE_CLASSES = {
  sm: 'h-7 max-sm:h-11 rounded-md px-2 text-label',
  md: 'h-8 max-sm:h-11 rounded-md px-3 text-cell',
  lg: 'h-11 rounded-lg px-4 text-body',
  xl: 'h-12 rounded-lg px-4 text-title-section font-semibold',
} as const;

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof VARIANT_CLASSES;
  size?: keyof typeof SIZE_CLASSES;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
  loading?: boolean;
  loadingLabel?: ReactNode;
  fullWidth?: boolean;
};

type ButtonContentProps = Pick<
  ButtonProps,
  'children' | 'leadingIcon' | 'loading' | 'loadingLabel' | 'size' | 'trailingIcon'
>;

function ButtonContent({
  children,
  leadingIcon,
  loading = false,
  loadingLabel,
  size = 'md',
  trailingIcon,
}: ButtonContentProps) {
  if (loading) {
    const spinnerSize = size === 'sm' ? 'xs' : 'sm';

    return (
      <>
        <Spinner size={spinnerSize} tone="current" aria-hidden />
        {loadingLabel ?? children}
      </>
    );
  }

  return (
    <>
      {leadingIcon}
      {children}
      {trailingIcon}
    </>
  );
}

export function Button({
  children,
  className,
  disabled,
  fullWidth = false,
  leadingIcon,
  loading = false,
  loadingLabel,
  size = 'md',
  trailingIcon,
  type = 'button',
  variant = 'primary',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading}
      className={cn(
        'inline-flex items-center justify-center gap-1 font-medium transition-colors duration-fast disabled:cursor-not-allowed',
        'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus-ring',
        SIZE_CLASSES[size],
        VARIANT_CLASSES[variant],
        fullWidth && 'w-full',
        className,
      )}
      {...props}
    >
      <ButtonContent
        size={size}
        loading={loading}
        loadingLabel={loadingLabel}
        leadingIcon={leadingIcon}
        trailingIcon={trailingIcon}
      >
        {children}
      </ButtonContent>
    </button>
  );
}
