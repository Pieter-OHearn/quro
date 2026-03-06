import type { PensionPageState } from '../types';
import { AddPensionTxnModal } from './AddPensionTxnModal';
import { PensionModal } from './PensionModal';

type PensionModalsProps = {
  state: PensionPageState;
};

export function PensionModals({ state }: Readonly<PensionModalsProps>) {
  const {
    showModal,
    setShowModal,
    editing,
    setEditing,
    pensions,
    addTxnForPot,
    setAddTxnForPot,
    editingTxn,
    setEditingTxn,
    handleSave,
    handleAddPensionTxn,
  } = state;
  const modalPot =
    addTxnForPot ??
    (editingTxn ? (pensions.find((pot) => pot.id === editingTxn.potId) ?? null) : null);

  return (
    <>
      {(showModal || editing) && (
        <PensionModal
          existing={editing}
          onClose={() => {
            setShowModal(false);
            setEditing(undefined);
          }}
          onSave={handleSave}
        />
      )}
      {modalPot && (
        <AddPensionTxnModal
          pot={modalPot}
          existing={editingTxn ?? undefined}
          onClose={() => {
            setAddTxnForPot(null);
            setEditingTxn(null);
          }}
          onSave={handleAddPensionTxn}
        />
      )}
    </>
  );
}
