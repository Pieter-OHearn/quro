import type { ReactNode } from 'react';
import { Button } from '@/components/ui';

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
      fullWidth
      loading={loading}
      loadingLabel={loadingText}
      className={className}
    >
      {idleContent}
    </Button>
  );
}
