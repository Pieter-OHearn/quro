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
  if (!state.showModal && !state.editing) return null;

  return (
    <PensionModal
      existing={state.editing}
      onClose={() => closePensionEditor(state)}
      onSave={state.handleSave}
    />
  );
}

function TxnEditorModal({ state }: Readonly<PensionModalsProps>) {
  const modalPot = resolveTxnModalPot(state);
  if (!modalPot) return null;

  return (
    <AddPensionTxnModal
      pot={modalPot}
      existing={state.editingTxn ?? undefined}
      existingDocument={
        state.editingTxn ? (state.documentsByTransactionId.get(state.editingTxn.id) ?? null) : null
      }
      onClose={() => closeTxnEditor(state)}
      onSave={state.handleAddPensionTxn}
    />
  );
}

function ImportEditorModal({ state }: Readonly<PensionModalsProps>) {
  if (!state.importModal) return null;

  return (
    <ImportPensionStatementModal
      pot={state.importModal.pot}
      initialImportId={state.importModal.importId}
      onClose={() => {
        state.closeImportModal();
      }}
    />
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
