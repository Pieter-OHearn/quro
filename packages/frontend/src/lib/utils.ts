import { twMerge } from 'tailwind-merge';

export function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(inputs.filter(Boolean).join(' '));
}

export function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
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
