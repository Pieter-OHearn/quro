import { cn } from '@/lib/utils';

// ─── Quro logo mark (V1) ──────────────────────────────────────────────────────
//
// A rounded-square Q with a round-capped tail on a 32-unit grid, drawn in one
// colour: `currentColor`. See docs/design-v1.md, section 8. The default colour
// is `text-brand` (evergreen on light, mint on dark); pass a `text-*` class to
// override it. Never a gradient, a tile or a second colour.

const DEFAULT_SIZE_PX = 36;

export interface QuroLogoProps {
  /** Rendered pixel size (square). Default 36. */
  size?: number;
  className?: string;
}

export function QuroLogo({ size = DEFAULT_SIZE_PX, className }: QuroLogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn('text-brand', className)}
      role="img"
      aria-label="Quro logo mark"
    >
      <rect x="9" y="8" width="13" height="13" rx="4.5" stroke="currentColor" strokeWidth="3" />
      <path d="M18 17 L25 24" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
