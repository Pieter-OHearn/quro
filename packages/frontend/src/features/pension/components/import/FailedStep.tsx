import { XCircle } from 'lucide-react';
import { Button } from '@/components/ui';
import { ImportBody, ImportFooter, ImportNotice } from './ImportChrome';

type FailedStepProps = {
  importErrorMessage: string | null;
  errorMessage: string;
  isCancelling: boolean;
  onCancelJob: () => Promise<boolean>;
  onClose: () => void;
};

export function FailedStep({
  importErrorMessage,
  errorMessage,
  isCancelling,
  onCancelJob,
  onClose,
}: Readonly<FailedStepProps>) {
  return (
    <>
      <ImportBody>
        <ImportNotice tone="danger">
          Import failed: {importErrorMessage || 'Unknown parser error'}
        </ImportNotice>
        {errorMessage && <ImportNotice tone="danger">{errorMessage}</ImportNotice>}
      </ImportBody>
      <ImportFooter>
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
        <Button
          variant="danger"
          onClick={() => {
            void (async () => {
              const cancelled = await onCancelJob();
              if (cancelled) onClose();
            })();
          }}
          loading={isCancelling}
          leadingIcon={<XCircle size={14} aria-hidden />}
        >
          Clear failed job
        </Button>
      </ImportFooter>
    </>
  );
}
