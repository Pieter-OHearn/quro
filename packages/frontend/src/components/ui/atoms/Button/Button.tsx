import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Spinner } from '../Spinner';

const VARIANT_CLASSES = {
  primary: 'bg-brand text-fg-inverted hover:bg-brand-hover disabled:bg-brand-disabled',
  secondary:
    'border border-border-default text-fg-muted hover:bg-surface-muted disabled:text-fg-faint disabled:hover:bg-transparent',
  danger:
    'border border-danger-border text-danger hover:bg-danger-soft disabled:text-danger/60 disabled:hover:bg-transparent',
  ghost:
    'text-fg-muted hover:bg-surface-muted disabled:text-fg-disabled disabled:hover:bg-transparent',
} as const;

const SIZE_CLASSES = {
  sm: 'rounded-lg px-3 py-1.5 text-xs',
  md: 'rounded-xl px-4 py-2 text-sm',
  lg: 'rounded-xl px-4 py-2.5 text-sm',
  xl: 'rounded-xl px-4 py-3 text-sm',
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
        'inline-flex items-center justify-center gap-2 font-medium transition-colors disabled:cursor-not-allowed',
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
