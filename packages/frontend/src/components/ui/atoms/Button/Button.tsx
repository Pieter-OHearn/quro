import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Spinner } from '../Spinner';

const VARIANT_CLASSES = {
  primary: 'bg-indigo-600 text-white hover:bg-indigo-700 disabled:bg-indigo-400',
  secondary:
    'border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:text-slate-400 disabled:hover:bg-transparent',
  danger:
    'border border-rose-100 text-rose-500 hover:bg-rose-50 disabled:text-rose-300 disabled:hover:bg-transparent',
  ghost: 'text-slate-600 hover:bg-slate-100 disabled:text-slate-300 disabled:hover:bg-transparent',
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
