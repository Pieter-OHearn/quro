import { useContext } from 'react';
import {
  DEFAULT_NUMBER_FORMAT,
  formatCurrency,
  formatNumber,
  type NumberFormatPreference,
} from '@quro/shared';
import { CurrencyContext } from '@/lib/currencyContextValue';
import { cn } from '@/lib/utils';

const FRACTION_DIGITS = 2;
const TWO_DECIMALS: Intl.NumberFormatOptions = {
  minimumFractionDigits: FRACTION_DIGITS,
  maximumFractionDigits: FRACTION_DIGITS,
};
const MINUS_SIGN = '\u2212';
const UNAVAILABLE_TEXT = 'Unavailable';

const DIRECTIONS = {
  gain: {
    sign: '+',
    arrow: '\u25B2',
    srLabel: 'up',
    textClassName: 'text-gain',
    chipClassName: 'bg-gain-soft',
  },
  loss: {
    sign: MINUS_SIGN,
    arrow: '\u25BC',
    srLabel: 'down',
    textClassName: 'text-loss',
    chipClassName: 'bg-loss-soft',
  },
  flat: {
    sign: '',
    arrow: null,
    srLabel: 'no change',
    textClassName: 'text-flat',
    chipClassName: 'bg-surface-muted',
  },
} as const;

type ChangeDirection = keyof typeof DIRECTIONS;

type ChangeBaseProps = {
  /** Signed amount, or a signed percentage where `1.84` reads `+1.84%`. */
  value: number;
  /** `chip` adds a soft background in the change colour. */
  variant?: 'text' | 'chip';
  /** Defaults to `true` for amounts and `false` for percentages. Zero never has an arrow. */
  showArrow?: boolean;
  className?: string;
};

export type ChangeProps = ChangeBaseProps &
  (
    | {
        format: 'amount';
        /** ISO 4217 code; omit it when the currency is shown elsewhere, such as a column header. */
        currency?: string;
      }
    | { format: 'percent'; currency?: never }
  );

type ChangeVariant = NonNullable<ChangeProps['variant']>;

type ChangeInput = {
  value: number;
  format: ChangeProps['format'];
  currency?: string;
  showArrow?: boolean;
};

type ChangeDisplay = {
  direction: ChangeDirection;
  text: string;
  arrow: string | null;
  /** False when the value is not a finite number and there is no change to announce. */
  available: boolean;
};

const BASE_CLASS_NAME =
  'inline-flex items-baseline gap-1 whitespace-nowrap font-numeric text-[13px] leading-[18px] font-medium';
const CHIP_CLASS_NAME = 'rounded-sm px-1.5 py-px';

function formatMagnitude(
  magnitude: number,
  format: ChangeProps['format'],
  currency: string | undefined,
  numberFormat: NumberFormatPreference,
): string {
  if (format === 'percent') return `${formatNumber(magnitude, numberFormat, TWO_DECIMALS)}%`;
  if (currency) return formatCurrency(magnitude, currency, true, numberFormat);
  return formatNumber(magnitude, numberFormat, TWO_DECIMALS);
}

function resolveDirection(value: number, magnitude: string): ChangeDirection {
  // The sign follows the displayed digits, so a value that rounds to 0.00 reads as no change.
  if (!/[1-9]/.test(magnitude)) return 'flat';
  return value > 0 ? 'gain' : 'loss';
}

function describeChange(
  { value, format, currency, showArrow = format === 'amount' }: ChangeInput,
  numberFormat: NumberFormatPreference,
): ChangeDisplay {
  if (!Number.isFinite(value)) {
    return { direction: 'flat', text: UNAVAILABLE_TEXT, arrow: null, available: false };
  }

  const magnitude = formatMagnitude(Math.abs(value), format, currency, numberFormat);
  const direction = resolveDirection(value, magnitude);
  const { sign, arrow } = DIRECTIONS[direction];
  return {
    direction,
    text: `${sign}${magnitude}`,
    arrow: showArrow ? arrow : null,
    available: true,
  };
}

function changeClassName(
  direction: ChangeDirection,
  variant: ChangeVariant,
  className: string | undefined,
): string {
  const { textClassName, chipClassName } = DIRECTIONS[direction];
  const isChip = variant === 'chip';
  return cn(
    BASE_CLASS_NAME,
    textClassName,
    isChip && CHIP_CLASS_NAME,
    isChip && chipClassName,
    className,
  );
}

/**
 * Renders a gain, loss or no change with a sign, an optional arrow and the change colour.
 * Numbers follow the signed-in user's number format and always show two decimals.
 */
export function Change({ variant = 'text', className, ...input }: Readonly<ChangeProps>) {
  const numberFormat = useContext(CurrencyContext)?.numberFormat ?? DEFAULT_NUMBER_FORMAT;
  const display = describeChange(input, numberFormat);

  return (
    <span className={changeClassName(display.direction, variant, className)}>
      {display.arrow ? <span aria-hidden="true">{display.arrow}</span> : null}
      {display.available ? (
        <span className="sr-only">{DIRECTIONS[display.direction].srLabel} </span>
      ) : null}
      {display.text}
    </span>
  );
}
