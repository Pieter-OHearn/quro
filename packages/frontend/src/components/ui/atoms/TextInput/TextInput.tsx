import type { InputHTMLAttributes } from 'react';
import { getFieldChrome } from '../sharedFieldStyles';

export type TextInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> & {
  value: string;
  onChange: (value: string) => void;
  error?: boolean;
};

export function TextInput({
  className,
  error = false,
  onChange,
  type = 'text',
  value,
  ...props
}: TextInputProps) {
  return (
    <input
      {...props}
      type={type}
      value={value}
      aria-invalid={error || undefined}
      className={getFieldChrome({ className, error })}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}
