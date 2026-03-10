import type { ReactNode } from 'react';

export type FormFieldProps = {
  label: ReactNode;
  required?: boolean;
  error?: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
};

export function FormField({ label, required, error, hint, children, className }: FormFieldProps) {
  return (
    <div className={className}>
      <label className="block text-xs font-semibold text-slate-600 mb-1.5">
        {label}
        {required && <span className="text-rose-500"> *</span>}
        {hint && <span className="text-slate-400 font-normal"> {hint}</span>}
      </label>
      {children}
      {error && <p className="text-xs text-rose-500 mt-1">{error}</p>}
    </div>
  );
}
