import type { SelectHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';
import { getFieldChrome } from '../sharedFieldStyles';

export type SelectInputOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

export type SelectInputProps = Omit<
  SelectHTMLAttributes<HTMLSelectElement>,
  'onChange' | 'value'
> & {
  value: string;
  onChange: (value: string) => void;
  options: readonly (SelectInputOption | string)[];
  error?: boolean;
};

export function SelectInput({
  className,
  disabled,
  error = false,
  onChange,
  options,
  value,
  ...props
}: SelectInputProps) {
  return (
    <select
      {...props}
      disabled={disabled}
      value={value}
      aria-invalid={error || undefined}
      className={getFieldChrome({
        className: cn('select-chevron', className),
        error,
        paddingClassName: 'pl-2 pr-9',
      })}
      onChange={(event) => onChange(event.target.value)}
    >
      {options.map((option) => {
        const optionValue = typeof option === 'string' ? option : option.value;
        const optionLabel = typeof option === 'string' ? option : option.label;
        const optionDisabled = typeof option === 'string' ? false : option.disabled;

        return (
          <option key={optionValue} value={optionValue} disabled={optionDisabled}>
            {optionLabel}
          </option>
        );
      })}
    </select>
  );
}
