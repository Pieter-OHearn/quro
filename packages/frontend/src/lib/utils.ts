import { twMerge } from 'tailwind-merge';

export function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(inputs.filter(Boolean).join(' '));
}

const DEFAULT_DATE_OPTIONS: Intl.DateTimeFormatOptions = {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
};

export function formatDate(
  iso: string,
  options: Intl.DateTimeFormatOptions = DEFAULT_DATE_OPTIONS,
) {
  return new Date(iso).toLocaleDateString('en-GB', options);
}

export function formatFixedInputValue(
  value: number | string | null | undefined,
  fractionDigits = 2,
): string {
  const normalized =
    typeof value === 'number' ? value : typeof value === 'string' ? Number.parseFloat(value) : NaN;

  if (!Number.isFinite(normalized)) return '';
  return normalized.toFixed(fractionDigits);
}
