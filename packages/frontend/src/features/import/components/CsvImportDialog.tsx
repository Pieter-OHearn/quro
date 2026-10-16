import type { CsvImportKind, CurrencyCode } from '@quro/shared';
import { Button, Modal } from '@/components/ui';
import { useImportFlow } from '../useImportFlow';
import { FileStep } from './FileStep';
import { MappingStep } from './MappingStep';
import { ReviewStep } from './ReviewStep';
import { RunStep } from './RunStep';

type Props = {
  kind: CsvImportKind;
  /** Savings: the account the rows are added to. */
  account?: { id: number; name: string; currency: CurrencyCode };
  onClose: () => void;
};

const TITLES = {
  file: 'Choose a file',
  mapping: 'Match the columns',
  review: 'Review the rows',
  run: 'Importing',
} as const;

/** Reviewed CSV import: file, column mapping, row review, then batched writes. */
export function CsvImportDialog({ kind, account, onClose }: Readonly<Props>) {
  const currency = account?.currency ?? 'EUR';
  const flow = useImportFlow({ kind, accountId: account?.id, currency });
  const { step, run } = flow;
  const running = step === 'run' && run.state.phase === 'running';
  const subtitle = account ? `Into ${account.name}` : 'Into your budget';

  return (
    <Modal
      title={`Import a CSV · ${TITLES[step]}`}
      subtitle={subtitle}
      maxWidth="3xl"
      onClose={running ? () => undefined : onClose}
      footer={<DialogFooter flow={flow} onClose={onClose} />}
    >
      <DialogBody flow={flow} kind={kind} currency={currency} />
    </Modal>
  );
}

type FooterProps = { flow: ReturnType<typeof useImportFlow>; onClose: () => void };

function DialogFooter({ flow, onClose }: Readonly<FooterProps>) {
  const { step, run } = flow;
  if (step === 'run') {
    const finished = run.state.phase === 'done' || run.state.phase === 'failed';
    return finished ? <Button onClick={onClose}>Close</Button> : null;
  }
  if (step === 'mapping') {
    return (
      <>
        <Button variant="secondary" onClick={() => flow.setStep('file')}>
          Back
        </Button>
        <Button
          loading={flow.busy}
          loadingLabel="Reading rows"
          onClick={() => void flow.runPreview()}
        >
          Preview rows
        </Button>
      </>
    );
  }
  if (step === 'review') {
    return (
      <>
        <Button variant="secondary" onClick={() => flow.setStep('mapping')}>
          Back
        </Button>
        <Button disabled={flow.selected.size === 0} onClick={flow.confirm}>
          Import {flow.selected.size} rows
        </Button>
      </>
    );
  }
  return (
    <Button variant="secondary" onClick={onClose}>
      Cancel
    </Button>
  );
}

type BodyProps = {
  flow: ReturnType<typeof useImportFlow>;
  kind: CsvImportKind;
  currency: CurrencyCode;
};

function DialogBody({ flow, kind, currency }: Readonly<BodyProps>) {
  const { step, preview, run } = flow;
  return (
    <div className="space-y-3 p-4">
      {flow.error ? (
        <p role="alert" className="text-cell text-danger">
          {flow.error}
        </p>
      ) : null}
      {step === 'file' && (
        <FileStep kind={kind} busy={flow.busy} onFile={(file) => void flow.chooseFile(file)} />
      )}
      {step === 'mapping' && flow.description && (
        <MappingStep
          kind={kind}
          description={flow.description}
          draft={flow.draft}
          profiles={flow.profiles}
          onChange={flow.setDraft}
        />
      )}
      {step === 'review' && preview && (
        <ReviewStep
          preview={preview}
          currency={currency}
          selected={flow.selected}
          onSelect={flow.setSelected}
          saveProfile={flow.saveProfile}
          onSaveProfile={flow.setSaveProfile}
        />
      )}
      {step === 'run' && (
        <RunStep
          state={run.state}
          currency={currency}
          onCancel={run.cancel}
          onResume={run.resume}
        />
      )}
    </div>
  );
}
