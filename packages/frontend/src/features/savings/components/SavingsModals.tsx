import type { SavingsAccount } from '@quro/shared';
import { AccountModal } from './AccountModal';
import { AddTxnModal } from './AddTxnModal';
import type { SaveAccountInput, SaveTransactionInput } from '../types';

type SavingsModalsProps = {
  showAccountModal: boolean;
  editing: SavingsAccount | undefined;
  addTxnFor: SavingsAccount | null;
  onCloseAccountModal: () => void;
  onSaveAccount: (account: SaveAccountInput) => void;
  onDeleteAccount: (id: number) => void;
  onCloseTxnModal: () => void;
  onSaveTxn: (transaction: SaveTransactionInput) => void;
};

export function SavingsModals({
  showAccountModal,
  editing,
  addTxnFor,
  onCloseAccountModal,
  onSaveAccount,
  onDeleteAccount,
  onCloseTxnModal,
  onSaveTxn,
}: Readonly<SavingsModalsProps>) {
  return (
    <>
      {(showAccountModal || editing) && (
        <AccountModal
          existing={editing}
          onClose={onCloseAccountModal}
          onSave={onSaveAccount}
          onDelete={onDeleteAccount}
        />
      )}
      {addTxnFor && (
        <AddTxnModal account={addTxnFor} onClose={onCloseTxnModal} onSave={onSaveTxn} />
      )}
    </>
  );
}
