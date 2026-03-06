import { useState } from 'react';
import type { PensionPot, PensionTransaction } from '@quro/shared';
import { useCurrency } from '@/lib/CurrencyContext';
import type { PensionTxnType, SavePensionTransactionInput } from '../types';

type AddPensionTxnSaveFn = (txn: SavePensionTransactionInput) => void;
const ISO_DATE_SLICE_END = 10;
const DEFAULT_TAX_NOTE = 'Contributions Tax';

type InitialPensionTxnValues = {
  type: PensionTxnType;
  amount: string;
  isEmployer: boolean;
  date: string;
  note: string;
};

function resolveNoteAfterTypeChange(
  currentNote: string,
  nextType: PensionTxnType,
  currentType: PensionTxnType,
): string {
  if (nextType === 'tax') return currentNote.trim() ? currentNote : DEFAULT_TAX_NOTE;
  if (currentType === 'tax' && currentNote === DEFAULT_TAX_NOTE) return '';
  return currentNote;
}

function buildPensionTxnPayload(
  potId: number,
  type: PensionTxnType,
  amount: number,
  date: string,
  note: string,
  isEmployer: boolean,
) {
  return {
    potId,
    type,
    amount,
    date,
    note,
    isEmployer: type === 'contribution' ? isEmployer : null,
  };
}

function buildInitialPensionTxnValues(
  existing: PensionTransaction | undefined,
): InitialPensionTxnValues {
  return {
    type: existing?.type ?? 'contribution',
    amount: existing != null ? String(existing.amount) : '',
    isEmployer: existing?.isEmployer ?? true,
    date: existing?.date ?? new Date().toISOString().slice(0, ISO_DATE_SLICE_END),
    note: existing?.note ?? '',
  };
}

function parsePensionAmount(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function createTypeChangeHandler(params: {
  currentType: PensionTxnType;
  setType: (value: PensionTxnType) => void;
  setError: (value: string) => void;
  setAmount: (value: string) => void;
  setIsEmployer: (value: boolean) => void;
  setNote: (value: string | ((current: string) => string)) => void;
}) {
  return (nextType: PensionTxnType): void => {
    params.setType(nextType);
    params.setError('');
    params.setAmount('');
    params.setIsEmployer(true);
    params.setNote((currentNote) =>
      resolveNoteAfterTypeChange(currentNote, nextType, params.currentType),
    );
  };
}

function createPensionTxnSaveHandler(params: {
  parsedAmount: number;
  setError: (value: string) => void;
  potId: number;
  type: PensionTxnType;
  date: string;
  note: string;
  isEmployer: boolean;
  existing: PensionTransaction | undefined;
  onSave: AddPensionTxnSaveFn;
  onClose: () => void;
}) {
  return (): void => {
    if (params.parsedAmount <= 0) {
      params.setError('Enter a valid amount');
      return;
    }

    const payload = buildPensionTxnPayload(
      params.potId,
      params.type,
      params.parsedAmount,
      params.date,
      params.note,
      params.isEmployer,
    );

    if (params.existing) params.onSave({ id: params.existing.id, ...payload });
    else params.onSave(payload);

    params.onClose();
  };
}

export function useAddPensionTxnForm(
  pot: PensionPot,
  existing: PensionTransaction | undefined,
  onSave: AddPensionTxnSaveFn,
  onClose: () => void,
) {
  const { fmtNative } = useCurrency();
  const initialValues = buildInitialPensionTxnValues(existing);
  const [type, setType] = useState<PensionTxnType>(initialValues.type);
  const [amount, setAmount] = useState(initialValues.amount);
  const [isEmployer, setIsEmployer] = useState(initialValues.isEmployer);
  const [date, setDate] = useState(initialValues.date);
  const [note, setNote] = useState(initialValues.note);
  const [error, setError] = useState('');

  const parsedAmount = parsePensionAmount(amount);
  const handleTypeChange = createTypeChangeHandler({
    currentType: type,
    setType,
    setError,
    setAmount,
    setIsEmployer,
    setNote,
  });
  const handleSave = createPensionTxnSaveHandler({
    parsedAmount,
    setError,
    potId: pot.id,
    type,
    date,
    note,
    isEmployer,
    existing,
    onSave,
    onClose,
  });

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
