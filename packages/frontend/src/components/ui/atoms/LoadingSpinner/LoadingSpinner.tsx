import { cn } from '@/lib/utils';
import { Spinner } from '../Spinner';

export type LoadingSpinnerProps = {
  className?: string;
  compact?: boolean;
  label?: string;
};

export function LoadingSpinner({
  className,
  compact = false,
  label = 'Loading',
}: LoadingSpinnerProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'flex items-center justify-center',
        compact ? 'min-h-[256px] p-4' : 'min-h-[400px] p-6',
        className,
      )}
    >
      <Spinner size="lg" tone="brand" aria-hidden />
      <span className="sr-only">{label}</span>
    </div>
  );
}
