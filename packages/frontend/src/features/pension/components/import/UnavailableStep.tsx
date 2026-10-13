import { Button } from '@/components/ui';
import { ImportBody, ImportFooter, ImportNotice } from './ImportChrome';

type UnavailableStepProps = {
  errorMessage: string;
  onClose: () => void;
};

export function UnavailableStep({ errorMessage, onClose }: Readonly<UnavailableStepProps>) {
  return (
    <>
      <ImportBody>
        <ImportNotice tone="neutral">
          This import is no longer available. It may have expired, been cancelled, or does not
          belong to this pension pot.
        </ImportNotice>
        {errorMessage && <ImportNotice tone="danger">{errorMessage}</ImportNotice>}
      </ImportBody>
      <ImportFooter>
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
      </ImportFooter>
    </>
  );
}
