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
        className={cn('pr-8 max-sm:pr-11', className)}
        onChange={onChange}
      />
      {/* The toggle covers the end of the field at its full height: 32px square on desktop and
          44px on phones. */}
      <button
        type="button"
        disabled={disabled}
        aria-label={show ? 'Hide password' : 'Show password'}
        aria-pressed={show}
        className="absolute inset-y-0 right-0 flex w-8 max-sm:w-11 items-center justify-center rounded-md text-fg-faint transition-colors duration-fast hover:text-fg-muted active:text-fg-muted focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus-ring disabled:cursor-not-allowed disabled:text-fg-disabled"
        onClick={onToggle}
      >
        {show ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
      </button>
    </div>
  );
}
