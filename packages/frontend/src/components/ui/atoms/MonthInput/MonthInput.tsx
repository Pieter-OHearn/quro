import { useState } from 'react';
import { MONTH_ABBREVIATIONS } from '@quro/shared';
import { cn } from '@/lib/utils';
import { SelectInput, type SelectInputOption } from '../SelectInput';
import { TextInput, type TextInputProps } from '../TextInput';

export type MonthInputProps = Omit<TextInputProps, 'type'> & {
  /**
   * Pick the month and year from two selects instead of the browser's month field. Defaults to
   * doing so only where the browser has no month field (Safari and Firefox on a computer), which
   * otherwise falls back to a plain text box.
   */
  selects?: boolean;
};

const MONTH_VALUE = /^(?<year>\d{4})-(?<month>\d{2})$/;
const MONTH_DIGITS = 2;
const YEARS_BEFORE = 10;
const YEARS_AFTER = 20;

let nativeMonthField: boolean | undefined;

function hasNativeMonthField(): boolean {
  if (typeof document === 'undefined') return true;
  if (nativeMonthField === undefined) {
    const input = document.createElement('input');
    input.setAttribute('type', 'month');
    nativeMonthField = input.type === 'month';
  }
  return nativeMonthField;
}

type MonthParts = { year: string; month: string };

function parseMonth(value: string): MonthParts | null {
  const groups = MONTH_VALUE.exec(value)?.groups;
  return groups ? { year: groups.year, month: groups.month } : null;
}

function yearOptions(selected: string): SelectInputOption[] {
  const current = new Date().getFullYear();
  const chosen = Number(selected) || current;
  const first = Math.min(current - YEARS_BEFORE, chosen);
  const last = Math.max(current + YEARS_AFTER, chosen);
  const years: SelectInputOption[] = [];
  for (let year = first; year <= last; year += 1) {
    years.push({ value: String(year), label: String(year) });
  }
  return years;
}

const MONTH_OPTIONS: SelectInputOption[] = MONTH_ABBREVIATIONS.map((label, index) => ({
  value: String(index + 1).padStart(MONTH_DIGITS, '0'),
  label,
}));

function withPlaceholder(
  options: SelectInputOption[],
  selected: string,
  label: string,
): SelectInputOption[] {
  return selected ? options : [{ value: '', label, disabled: true }, ...options];
}

type MonthSelectsProps = Pick<
  MonthInputProps,
  'value' | 'onChange' | 'id' | 'disabled' | 'error' | 'className' | 'required'
> & {
  'aria-label'?: string;
  'aria-describedby'?: string;
};

// Holds a month or year picked on its own until both are chosen; `value` only changes to a
// complete "YYYY-MM", as the browser's month field does.
function MonthSelects({
  value,
  onChange,
  id,
  disabled,
  error,
  className,
  required,
  'aria-label': ariaLabel,
  'aria-describedby': ariaDescribedBy,
}: Readonly<MonthSelectsProps>) {
  const [draft, setDraft] = useState<MonthParts>(
    () => parseMonth(value) ?? { year: '', month: '' },
  );
  const shown = parseMonth(value) ?? draft;

  const pick = (next: MonthParts) => {
    setDraft(next);
    if (next.year && next.month) onChange(`${next.year}-${next.month}`);
  };

  return (
    <div className={cn('grid grid-cols-2 gap-2', className)} role="group" aria-label={ariaLabel}>
      <SelectInput
        id={id}
        aria-label="Month"
        aria-describedby={ariaDescribedBy}
        disabled={disabled}
        required={required}
        error={error}
        value={shown.month}
        options={withPlaceholder(MONTH_OPTIONS, shown.month, 'Month')}
        onChange={(month) => pick({ ...shown, month })}
      />
      <SelectInput
        aria-label="Year"
        aria-describedby={ariaDescribedBy}
        disabled={disabled}
        required={required}
        error={error}
        value={shown.year}
        options={withPlaceholder(yearOptions(shown.year), shown.year, 'Year')}
        onChange={(year) => pick({ ...shown, year })}
      />
    </div>
  );
}

export function MonthInput({ selects, ...props }: MonthInputProps) {
  if (selects ?? !hasNativeMonthField()) {
    return (
      <MonthSelects
        value={props.value}
        onChange={props.onChange}
        id={props.id}
        disabled={props.disabled}
        error={props.error}
        className={props.className}
        required={props.required}
        aria-label={props['aria-label']}
        aria-describedby={props['aria-describedby']}
      />
    );
  }
  return <TextInput type="month" {...props} />;
}
