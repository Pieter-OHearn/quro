import { cn } from '@/lib/utils';
import { Spinner } from '../Spinner';

export type LoadingSpinnerProps = {
  className?: string;
};

export function LoadingSpinner({ className }: LoadingSpinnerProps) {
  return (
    <div className={cn('p-6 flex items-center justify-center min-h-[400px]', className)}>
      <Spinner size="lg" tone="brand" aria-label="Loading" />
    </div>
  );
}
