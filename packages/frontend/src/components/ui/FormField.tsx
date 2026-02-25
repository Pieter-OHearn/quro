import { cn } from "@/lib/utils";

type FormFieldProps = {
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
  children: React.ReactNode;
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

type TextInputProps = {
  value: string;
  onChange: (value: string) => void;
  error?: boolean;
  placeholder?: string;
  type?: string;
  step?: string;
  disabled?: boolean;
  className?: string;
  maxLength?: number;
};

export function TextInput({ value, onChange, error, placeholder, type = "text", step, disabled, className, maxLength }: TextInputProps) {
  return (
    <input
      type={type}
      step={step}
      maxLength={maxLength}
      disabled={disabled}
      className={cn(
        "w-full rounded-xl border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300",
        error ? "border-rose-300 bg-rose-50" : "border-slate-200 bg-slate-50",
        disabled && "opacity-50",
        className,
      )}
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

type CurrencyInputProps = {
  currency: string;
  value: string;
  onChange: (value: string) => void;
  error?: boolean;
  placeholder?: string;
  step?: string;
};

export function CurrencyInput({ currency, value, onChange, error, placeholder = "0.00", step = "0.01" }: CurrencyInputProps) {
  return (
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-medium">{currency}</span>
      <input
        type="number"
        step={step}
        className={cn(
          "w-full rounded-xl border pl-12 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300",
          error ? "border-rose-300 bg-rose-50" : "border-slate-200 bg-slate-50",
        )}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

type SelectInputProps = {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[] | string[];
  className?: string;
};

export function SelectInput({ value, onChange, options, className }: SelectInputProps) {
  return (
    <select
      className={cn(
        "w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300",
        className,
      )}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {options.map((opt) => {
        const val = typeof opt === "string" ? opt : opt.value;
        const label = typeof opt === "string" ? opt : opt.label;
        return <option key={val} value={val}>{label}</option>;
      })}
    </select>
  );
}
