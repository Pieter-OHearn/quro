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
    addTxnForPot,
    setAddTxnForPot,
    handleSave,
    handleAddPensionTxn,
  } = state;

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
      {addTxnForPot && (
        <AddPensionTxnModal
          pot={addTxnForPot}
          onClose={() => setAddTxnForPot(null)}
          onSave={handleAddPensionTxn}
        />
      )}
    </>
  );
}
