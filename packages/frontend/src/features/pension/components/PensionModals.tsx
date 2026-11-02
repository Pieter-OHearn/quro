import { ModalPresence } from '@/components/ui';
import type { PensionPageState } from '../types';
import { AddPensionTxnModal } from './AddPensionTxnModal';
import { ImportPensionStatementModal } from './ImportPensionStatementModal';
import { PensionModal } from './PensionModal';

type PensionModalsProps = {
  state: PensionPageState;
};

function resolveTxnModalPot(state: PensionPageState) {
  if (state.addTxnForPot) return state.addTxnForPot;
  if (!state.editingTxn) return null;
  return state.pensions.find((pot) => pot.id === state.editingTxn?.potId) ?? null;
}

function closePensionEditor(state: PensionPageState): void {
  state.setShowModal(false);
  state.setEditing(undefined);
}

function closeTxnEditor(state: PensionPageState): void {
  state.setAddTxnForPot(null);
  state.setEditingTxn(null);
}

function PensionEditorModal({ state }: Readonly<PensionModalsProps>) {
  const open = state.showModal || Boolean(state.editing);

  return (
    <ModalPresence open={open}>
      {open && (
        <PensionModal
          existing={state.editing}
          onClose={() => closePensionEditor(state)}
          onSave={state.handleSave}
        />
      )}
    </ModalPresence>
  );
}

function TxnEditorModal({ state }: Readonly<PensionModalsProps>) {
  const modalPot = resolveTxnModalPot(state);

  return (
    <ModalPresence open={Boolean(modalPot)}>
      {modalPot && (
        <AddPensionTxnModal
          pot={modalPot}
          existing={state.editingTxn ?? undefined}
          existingDocument={
            state.editingTxn
              ? (state.documentsByTransactionId.get(state.editingTxn.id) ?? null)
              : null
          }
          onClose={() => closeTxnEditor(state)}
          onSave={state.handleAddPensionTxn}
        />
      )}
    </ModalPresence>
  );
}

function ImportEditorModal({ state }: Readonly<PensionModalsProps>) {
  const { importModal } = state;

  return (
    <ModalPresence open={importModal !== null}>
      {importModal && (
        <ImportPensionStatementModal
          pot={importModal.pot}
          initialImportId={importModal.importId}
          onClose={() => {
            state.closeImportModal();
          }}
        />
      )}
    </ModalPresence>
  );
}

export function PensionModals({ state }: Readonly<PensionModalsProps>) {
  return (
    <>
      <PensionEditorModal state={state} />
      <TxnEditorModal state={state} />
      <ImportEditorModal state={state} />
    </>
  );
}
