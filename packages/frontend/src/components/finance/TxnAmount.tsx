import { cn } from '@/lib/utils';

const MINUS_SIGN = '−';

export type TxnAmountProps = {
  /** Signed amount: money in is positive, money out is negative. */
  value: number;
  /** Formats the magnitude, for example `(amount) => fmtNative(amount, currency)`. */
  format: (magnitude: number) => string;
  className?: string;
};

/**
 * The amount of a transaction row: money in reads `+1,250.00` in the gain colour, money out
 * reads `−1,250.00` (a true minus sign) in the figure colour, and an amount that formats as
 * zero has no sign. Gains and losses of a value, rather than money moving, use `Change`.
 */
export function TxnAmount({ value, format, className }: Readonly<TxnAmountProps>) {
  const magnitude = format(Math.abs(value));
  const isZero = !Number.isFinite(value) || magnitude === format(0);
  const isIn = !isZero && value > 0;
  let sign = '';
  if (!isZero) sign = isIn ? '+' : MINUS_SIGN;

  return (
    <span
      className={cn('whitespace-nowrap font-numeric', isIn ? 'text-gain' : 'text-fg', className)}
    >
      {sign}
      {magnitude}
    </span>
  );
}
