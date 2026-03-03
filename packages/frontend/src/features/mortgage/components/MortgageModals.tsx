import type { Mortgage as MortgageType, MortgageTransaction, Property } from '@quro/shared';
import type { MortgageFormPayload } from '../types';
import { AddMortgageModal } from './AddMortgageModal';
import { AddMortgageTxnModal } from './AddMortgageTxnModal';

type MortgageModalsProps = {
  showTxnModal: boolean;
  showMortgageModal: boolean;
  mortgage: MortgageType;
  editingMortgage: MortgageType | null;
  properties: Property[];
  editingLinkedPropertyId: number | null;
  onCloseTxnModal: () => void;
  onCloseMortgageModal: () => void;
  onSaveTxn: (t: Omit<MortgageTransaction, 'id'>) => void;
  onSaveMortgage: (payload: MortgageFormPayload) => Promise<void>;
};

export function MortgageModals({
  showTxnModal,
  showMortgageModal,
  mortgage,
  editingMortgage,
  properties,
  editingLinkedPropertyId,
  onCloseTxnModal,
  onCloseMortgageModal,
  onSaveTxn,
  onSaveMortgage,
}: Readonly<MortgageModalsProps>) {
  return (
    <>
      {showTxnModal && (
        <AddMortgageTxnModal mortgage={mortgage} onClose={onCloseTxnModal} onSave={onSaveTxn} />
      )}
      {showMortgageModal && (
        <AddMortgageModal
          existing={editingMortgage ?? undefined}
          properties={properties}
          linkedPropertyId={editingLinkedPropertyId}
          onClose={onCloseMortgageModal}
          onSave={onSaveMortgage}
        />
      )}
    </>
  );
}
