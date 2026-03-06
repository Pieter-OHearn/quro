import type { SavingsAccount, SavingsTransaction } from '@quro/shared';
import { AccountModal } from './AccountModal';
import { AddTxnModal } from './AddTxnModal';
import type { SaveAccountInput, SaveTransactionInput } from '../types';

type SavingsModalsProps = {
  accounts: SavingsAccount[];
  showAccountModal: boolean;
  editing: SavingsAccount | undefined;
  addTxnFor: SavingsAccount | null;
  editingTxn: SavingsTransaction | null;
  onCloseAccountModal: () => void;
  onSaveAccount: (account: SaveAccountInput) => void;
  onDeleteAccount: (id: number) => void;
  onCloseTxnModal: () => void;
  onSaveTxn: (transaction: SaveTransactionInput) => void;
};

export function SavingsModals({
  accounts,
  showAccountModal,
  editing,
  addTxnFor,
  editingTxn,
  onCloseAccountModal,
  onSaveAccount,
  onDeleteAccount,
  onCloseTxnModal,
  onSaveTxn,
}: Readonly<SavingsModalsProps>) {
  const transactionAccount =
    addTxnFor ??
    (editingTxn ? (accounts.find((account) => account.id === editingTxn.accountId) ?? null) : null);

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
      {transactionAccount && (
        <AddTxnModal
          account={transactionAccount}
          existing={editingTxn ?? undefined}
          onClose={onCloseTxnModal}
          onSave={onSaveTxn}
        />
      )}
    </>
  );
}
