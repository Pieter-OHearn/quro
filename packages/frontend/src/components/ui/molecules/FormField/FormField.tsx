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
      <label className={cn('mb-1.5 block text-xs font-semibold text-slate-600', labelClassName)}>
        {label}
        {required && <span className="text-rose-500"> *</span>}
        {hint && <span className="text-slate-400 font-normal"> {hint}</span>}
      </label>
      {children}
      {error && <p className={cn('mt-1 text-xs text-rose-500', errorClassName)}>{error}</p>}
    </div>
  );
}
