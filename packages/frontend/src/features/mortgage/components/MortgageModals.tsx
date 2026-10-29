import type { Mortgage as MortgageType, MortgageTransaction, Property } from '@quro/shared';
import type { MortgageFormPayload, SaveMortgageTxnInput } from '../types';
import type { DeleteMortgageMode } from '../hooks/mutations';
import { AddMortgageModal } from './AddMortgageModal';
import { AddMortgageTxnModal } from './AddMortgageTxnModal';

type MortgageModalsProps = {
  showTxnModal: boolean;
  editingTxn: MortgageTransaction | null;
  showMortgageModal: boolean;
  mortgage: MortgageType;
  /** The mortgage's ledger, for the suggested repayment. */
  transactions: MortgageTransaction[];
  editingMortgage: MortgageType | null;
  properties: Property[];
  editingLinkedPropertyId: number | null;
  onCloseTxnModal: () => void;
  onCloseMortgageModal: () => void;
  onSaveTxn: (t: SaveMortgageTxnInput) => void;
  onSaveMortgage: (payload: MortgageFormPayload) => Promise<void>;
  onDeleteMortgage: (id: number, mode?: DeleteMortgageMode) => void;
};

export function MortgageModals({
  showTxnModal,
  editingTxn,
  showMortgageModal,
  mortgage,
  transactions,
  editingMortgage,
  properties,
  editingLinkedPropertyId,
  onCloseTxnModal,
  onCloseMortgageModal,
  onSaveTxn,
  onSaveMortgage,
  onDeleteMortgage,
}: Readonly<MortgageModalsProps>) {
  return (
    <>
      {(showTxnModal || editingTxn) && (
        <AddMortgageTxnModal
          mortgage={mortgage}
          transactions={transactions}
          existing={editingTxn ?? undefined}
          onClose={onCloseTxnModal}
          onSave={onSaveTxn}
        />
      )}
      {showMortgageModal && (
        <AddMortgageModal
          existing={editingMortgage ?? undefined}
          properties={properties}
          linkedPropertyId={editingLinkedPropertyId}
          onClose={onCloseMortgageModal}
          onSave={onSaveMortgage}
          onDelete={onDeleteMortgage}
        />
      )}
    </>
  );
}
