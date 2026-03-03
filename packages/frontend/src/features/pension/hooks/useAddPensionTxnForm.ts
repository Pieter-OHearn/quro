import { useState } from 'react';
import type { PensionPot, PensionTransaction } from '@quro/shared';
import { useCurrency } from '@/lib/CurrencyContext';
import type { PensionTxnType } from '../types';

type AddPensionTxnSaveFn = (txn: Omit<PensionTransaction, 'id'>) => void;
const ISO_DATE_SLICE_END = 10;

export function useAddPensionTxnForm(
  pot: PensionPot,
  onSave: AddPensionTxnSaveFn,
  onClose: () => void,
) {
  const { fmtNative } = useCurrency();
  const [type, setType] = useState<PensionTxnType>('contribution');
  const [amount, setAmount] = useState('');
  const [isEmployer, setIsEmployer] = useState(false);
  const [date, setDate] = useState(new Date().toISOString().slice(0, ISO_DATE_SLICE_END));
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  const parsedAmount = parseFloat(amount) || 0;

  function handleTypeChange(nextType: PensionTxnType): void {
    setType(nextType);
    setError('');
    setAmount('');
    setIsEmployer(false);
  }

  function handleSave(): void {
    if (parsedAmount <= 0) {
      setError('Enter a valid amount');
      return;
    }

    onSave({
      potId: pot.id,
      type,
      amount: parsedAmount,
      date,
      note,
      isEmployer: type === 'contribution' ? isEmployer : null,
    });

    onClose();
  }

  return {
    type,
    amount,
    isEmployer,
    date,
    note,
    error,
    parsedAmount,
    fmtNative,
    setAmount,
    setIsEmployer,
    setDate,
    setNote,
    setError,
    handleTypeChange,
    handleSave,
  };
}
