import type { InputHTMLAttributes } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TextInput } from '../TextInput';

export type PasswordInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'onChange' | 'type' | 'value'
> & {
  value: string;
  onChange: (value: string) => void;
  show: boolean;
  onToggle: () => void;
  error?: boolean;
};

export function PasswordInput({
  className,
  disabled,
  error = false,
  onChange,
  onToggle,
  show,
  value,
  ...props
}: PasswordInputProps) {
  return (
    <div className="relative">
      <TextInput
        {...props}
        type={show ? 'text' : 'password'}
        value={value}
        disabled={disabled}
        error={error}
        className={cn('pr-11', className)}
        onChange={onChange}
      />
      <button
        type="button"
        disabled={disabled}
        aria-label={show ? 'Hide password' : 'Show password'}
        aria-pressed={show}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 transition-colors hover:text-slate-600 disabled:cursor-not-allowed disabled:text-slate-300"
        onClick={onToggle}
      >
        {show ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  );
}
