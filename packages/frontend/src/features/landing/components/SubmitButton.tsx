import type { ReactNode } from 'react';
import { Button } from '@/components/ui';

type SubmitButtonProps = {
  loading: boolean;
  loadingText: string;
  idleContent: ReactNode;
};

export function SubmitButton({ loading, loadingText, idleContent }: Readonly<SubmitButtonProps>) {
  return (
    <Button
      type="submit"
      variant="primary"
      size="xl"
      fullWidth
      loading={loading}
      loadingLabel={loadingText}
      className="mt-2 font-semibold transition-all"
    >
      {idleContent}
    </Button>
  );
}
