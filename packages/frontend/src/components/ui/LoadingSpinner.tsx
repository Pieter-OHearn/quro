import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

type LoadingSpinnerProps = {
  className?: string;
};

export function LoadingSpinner({ className }: LoadingSpinnerProps) {
  return (
    <div className={cn('p-6 flex items-center justify-center min-h-[400px]', className)}>
      <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
    </div>
  );
}
