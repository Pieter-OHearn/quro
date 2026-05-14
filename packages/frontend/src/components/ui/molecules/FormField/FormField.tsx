import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type FormFieldProps = {
  label: ReactNode;
  required?: boolean;
  error?: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
  labelClassName?: string;
  errorClassName?: string;
};

export function FormField({
  label,
  required,
  error,
  hint,
  children,
  className,
  labelClassName,
  errorClassName,
}: FormFieldProps) {
  return (
    <div className={className}>
      <label className={cn('mb-1.5 block text-xs font-semibold text-fg-muted', labelClassName)}>
        {label}
        {required && <span className="text-danger"> *</span>}
        {hint && <span className="text-fg-faint font-normal"> {hint}</span>}
      </label>
      {children}
      {error && <p className={cn('mt-1 text-xs text-danger', errorClassName)}>{error}</p>}
    </div>
  );
}
