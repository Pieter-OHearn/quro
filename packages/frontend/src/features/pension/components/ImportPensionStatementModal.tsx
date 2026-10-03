import { Modal } from '@/components/ui';
import type { PensionPot } from '@quro/shared';

import { usePensionImportModalController } from '../hooks/usePensionImportModalController';

import { ImportHeader } from './import/ImportHeader';
import { UploadStep } from './import/UploadStep';
import { QueuedStep } from './import/QueuedStep';
import { ReviewStep } from './import/ReviewStep';
import { FailedStep } from './import/FailedStep';
import { UnavailableStep } from './import/UnavailableStep';
type ImportPensionStatementModalProps = {
  pot: PensionPot;
  onClose: () => void;
  initialImportId?: number | null;
};

type ModalStepContentProps = {
  controller: ReturnType<typeof usePensionImportModalController>;
  pot: PensionPot;
  onClose: () => void;
  displayFileName: string;
};

function ModalStepContent({
  controller,
  pot,
  onClose,
  displayFileName,
}: Readonly<ModalStepContentProps>) {
  if (controller.step === 'upload') {
    return (
      <UploadStep
        file={controller.selectedFile}
        provider={pot.provider}
        potName={pot.name}
        errorMessage={controller.errorMessage}
        isUploading={controller.isUploading}
        onFileChange={controller.handleFileChange}
        onUpload={controller.handleUpload}
        onClose={onClose}
      />
    );
  }

  if (controller.step === 'queued') {
    return (
      <QueuedStep
        fileName={displayFileName}
        jobPhase={controller.jobPhase}
        confirmMode={controller.confirmMode}
        isCancelling={controller.isCancelling}
        errorMessage={controller.errorMessage}
        modelCaption={controller.modelCaption}
        onSetConfirmMode={controller.setConfirmMode}
        onCancelJob={controller.handleCancelJob}
        onClose={onClose}
      />
    );
  }

  if (controller.step === 'review') {
    return <ReviewStep controller={controller} onClose={onClose} />;
  }

  if (controller.step === 'failed') {
    return (
      <FailedStep
        importErrorMessage={controller.importQuery.data?.errorMessage ?? null}
        errorMessage={controller.errorMessage}
        isCancelling={controller.isCancelling}
        onCancelJob={controller.handleCancelJob}
        onClose={onClose}
      />
    );
  }

  return <UnavailableStep errorMessage={controller.errorMessage} onClose={onClose} />;
}

function ImportPensionStatementModalContent({
  pot,
  onClose,
  initialImportId,
}: Readonly<ImportPensionStatementModalProps>) {
  const controller = usePensionImportModalController({
    potId: pot.id,
    initialImportId,
  });
  const reviewLayout = controller.step === 'review';
  const displayFileName = controller.fileName || controller.importQuery.data?.fileName || '';

  return (
    <Modal
      title="Import Annual Statement"
      onClose={onClose}
      maxWidth={reviewLayout ? '3xl' : 'lg'}
      scrollable
      backdropClassName="bg-overlay/40 backdrop-blur-sm"
      contentClassName="shadow-2xl"
      bodyClassName="p-0 space-y-0 min-h-0 flex flex-col"
      header={
        <ImportHeader
          pot={pot}
          step={controller.step}
          jobPhase={controller.jobPhase}
          onClose={onClose}
        />
      }
    >
      <ModalStepContent
        controller={controller}
        pot={pot}
        onClose={onClose}
        displayFileName={displayFileName}
      />
    </Modal>
  );
}

export function ImportPensionStatementModal(props: Readonly<ImportPensionStatementModalProps>) {
  return (
    <ImportPensionStatementModalContent
      key={`${props.pot.id}:${props.initialImportId ?? 'new'}`}
      {...props}
    />
  );
}
