import { extendTailwindMerge } from 'tailwind-merge';

/**
 * The V1 type scale utilities (`text-figure-hero`, `text-label`, …) in styles/theme.css.
 * tailwind-merge reads an unknown `text-*` class as a text colour, so without this
 * `cn('text-label text-fg-muted')` would drop `text-label`.
 */
const TYPE_SCALE_UTILITIES = [
  'figure-hero',
  'figure-lg',
  'figure-md',
  'figure-cell',
  'title-page',
  'title-section',
  'body',
  'cell',
  'label',
  'caption',
];

const twMerge = extendTailwindMerge({
  extend: { classGroups: { 'font-size': [{ text: TYPE_SCALE_UTILITIES }] } },
});

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
