import type { SavingsAccount, SavingsTransaction } from '@quro/shared';
import { AccountModal } from './AccountModal';
import { AddTxnModal } from './AddTxnModal';
import type { DeleteSavingsAccountMode, SaveAccountInput, SaveTransactionInput } from '../types';

type SavingsModalsProps = {
  accounts: SavingsAccount[];
  showAccountModal: boolean;
  editing: SavingsAccount | undefined;
  addTxnFor: SavingsAccount | null;
  editingTxn: SavingsTransaction | null;
  onCloseAccountModal: () => void;
  onSaveAccount: (account: SaveAccountInput) => Promise<void>;
  onDeleteAccount: (id: number, mode: DeleteSavingsAccountMode) => Promise<void>;
  onCloseTxnModal: () => void;
  onSaveTxn: (transaction: SaveTransactionInput) => Promise<void>;
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
