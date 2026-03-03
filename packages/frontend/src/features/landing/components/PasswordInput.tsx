import type { KeyboardEvent } from 'react';
import { Eye, EyeOff } from 'lucide-react';

type PasswordInputProps = {
  value: string;
  placeholder: string;
  show: boolean;
  onToggle: () => void;
  onChange: (value: string) => void;
  onKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void;
  error?: string;
};

export function PasswordInput({
  value,
  placeholder,
  show,
  onToggle,
  onChange,
  onKeyDown,
  error,
}: Readonly<PasswordInputProps>) {
  return (
    <div className="relative">
      <input
        type={show ? 'text' : 'password'}
        placeholder={placeholder}
        className={`w-full rounded-xl border px-4 py-3 pr-11 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 transition-all ${error ? 'border-rose-300 bg-rose-50' : 'border-slate-200 bg-slate-50'}`}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={onKeyDown}
      />
      <button
        onClick={onToggle}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
      >
        {show ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  );
}
