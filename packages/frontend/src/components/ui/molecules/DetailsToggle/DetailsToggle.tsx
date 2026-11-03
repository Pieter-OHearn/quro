import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export type DetailsToggleProps = {
  open: boolean;
  /** The id of the element the button shows and hides. */
  controlsId: string;
  /** Names what the details belong to, for assistive technology ("Show details for …"). */
  label: string;
  onToggle: () => void;
  className?: string;
};

/**
 * The "Show details" control of a phone card: a 44px text button that opens the figures the card
 * leaves out below 768px. It is hidden from 768px, where the card shows everything.
 */
export function DetailsToggle({
  open,
  controlsId,
  label,
  onToggle,
  className,
}: Readonly<DetailsToggleProps>) {
  const text = open ? 'Hide details' : 'Show details';
  return (
    <button
      type="button"
      aria-expanded={open}
      aria-controls={controlsId}
      aria-label={`${text} for ${label}`}
      onClick={onToggle}
      className={cn(
        'inline-flex min-h-11 items-center gap-1 text-label text-brand-fg underline-offset-2 hover:underline md:hidden focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus-ring',
        className,
      )}
    >
      {text}
      <ChevronDown
        size={14}
        aria-hidden
        className={cn('transition-transform duration-fast', open && 'rotate-180')}
      />
    </button>
  );
}
