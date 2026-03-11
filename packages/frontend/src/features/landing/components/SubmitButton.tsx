import type { ReactNode } from 'react';
import { Button } from '@/components/ui';
import { cn } from '@/lib/utils';

type SubmitButtonProps = {
  loading: boolean;
  loadingText: string;
  idleContent: ReactNode;
  className?: string;
};

export function SubmitButton({
  loading,
  loadingText,
  idleContent,
  className,
}: Readonly<SubmitButtonProps>) {
  return (
    <Button
      type="submit"
      variant="primary"
      size="xl"
      fullWidth
      loading={loading}
      loadingLabel={loadingText}
      className={cn('mt-2 font-semibold transition-all', className)}
    >
      {idleContent}
    </Button>
  );
}
