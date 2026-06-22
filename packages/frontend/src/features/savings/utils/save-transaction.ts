import type { SaveTransactionInput } from '../types';

type SaveSavingsTransactionParams = {
  transaction: SaveTransactionInput;
  onSave: (transaction: SaveTransactionInput) => Promise<void>;
  onClose: () => void;
  setError: (message: string) => void;
};

export async function saveSavingsTransaction({
  transaction,
  onSave,
  onClose,
  setError,
}: SaveSavingsTransactionParams): Promise<void> {
  try {
    await onSave(transaction);
    onClose();
  } catch {
    setError('Failed to save transaction. Please try again.');
  }
}
