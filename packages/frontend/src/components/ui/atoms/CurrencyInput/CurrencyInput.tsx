import type { InputHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';
import { TextInput } from '../TextInput';

export type CurrencyInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'onChange' | 'type' | 'value'
> & {
  currency: string;
  value: string;
  onChange: (value: string) => void;
  error?: boolean;
  containerClassName?: string;
};

export function CurrencyInput({
  className,
  containerClassName,
  currency,
  error = false,
  inputMode = 'decimal',
  onChange,
  placeholder = '0.00',
  step = '0.01',
  value,
  ...props
}: CurrencyInputProps) {
  return (
    <div className={cn('relative', containerClassName)}>
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-medium text-slate-400">
        {currency}
      </span>
      <TextInput
        {...props}
        type="number"
        inputMode={inputMode}
        step={step}
        value={value}
        error={error}
        placeholder={placeholder}
        className={cn('pl-12 pr-4', className)}
        onChange={onChange}
      />
    </div>
  );
}
