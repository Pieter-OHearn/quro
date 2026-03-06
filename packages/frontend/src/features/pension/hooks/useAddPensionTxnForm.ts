import { useState } from 'react';
import type { PensionPot, PensionTransaction } from '@quro/shared';
import { useCurrency } from '@/lib/CurrencyContext';
import type {
  AnnualStatementDirection,
  PensionTxnType,
  SavePensionTransactionInput,
} from '../types';

type AddPensionTxnSaveFn = (txn: SavePensionTransactionInput) => void;
const ISO_DATE_SLICE_END = 10;

type InitialPensionTxnValues = {
  type: PensionTxnType;
  amount: string;
  taxAmount: string;
  annualStatementDirection: AnnualStatementDirection;
  isEmployer: boolean;
  date: string;
  note: string;
};

function parsePensionAmount(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function resolveInitialTransactionType(existing: PensionTransaction | undefined): PensionTxnType {
  return existing?.type ?? 'contribution';
}

function resolveInitialTransactionAmount(existing: PensionTransaction | undefined): string {
  if (!existing) return '';
  if (existing.type !== 'annual_statement') return String(existing.amount);
  return String(Math.abs(existing.amount));
}

function resolveInitialTaxAmount(existing: PensionTransaction | undefined): string {
  return existing?.type === 'contribution' ? String(existing.taxAmount) : '';
}

function resolveInitialStatementDirection(
  existing: PensionTransaction | undefined,
): AnnualStatementDirection {
  if (!existing || existing.type !== 'annual_statement') return 'gain';
  return existing.amount < 0 ? 'loss' : 'gain';
}

function resolveInitialDate(existing: PensionTransaction | undefined): string {
  return existing?.date ?? new Date().toISOString().slice(0, ISO_DATE_SLICE_END);
}

function resolveInitialNote(existing: PensionTransaction | undefined): string {
  return existing?.note ?? '';
}

function buildPensionTxnPayload(params: {
  potId: number;
  type: PensionTxnType;
  amount: number;
  taxAmount: number;
  annualStatementDirection: AnnualStatementDirection;
  date: string;
  note: string;
  isEmployer: boolean;
}): Omit<PensionTransaction, 'id'> {
  if (params.type === 'contribution') {
    return {
      potId: params.potId,
      type: params.type,
      amount: params.amount,
      taxAmount: params.taxAmount,
      date: params.date,
      note: params.note,
      isEmployer: params.isEmployer,
    };
  }

  if (params.type === 'fee') {
    return {
      potId: params.potId,
      type: params.type,
      amount: params.amount,
      taxAmount: 0,
      date: params.date,
      note: params.note,
      isEmployer: null,
    };
  }

  return {
    potId: params.potId,
    type: params.type,
    amount: params.annualStatementDirection === 'gain' ? params.amount : -params.amount,
    taxAmount: 0,
    date: params.date,
    note: params.note,
    isEmployer: null,
  };
}

function buildInitialPensionTxnValues(
  existing: PensionTransaction | undefined,
): InitialPensionTxnValues {
  return {
    type: resolveInitialTransactionType(existing),
    amount: resolveInitialTransactionAmount(existing),
    taxAmount: resolveInitialTaxAmount(existing),
    annualStatementDirection: resolveInitialStatementDirection(existing),
    isEmployer: existing?.isEmployer ?? true,
    date: resolveInitialDate(existing),
    note: resolveInitialNote(existing),
  };
}

function createPensionTxnSaveHandler(params: {
  parsedAmount: number;
  parsedTaxAmount: number;
  setError: (value: string) => void;
  potId: number;
  type: PensionTxnType;
  annualStatementDirection: AnnualStatementDirection;
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

    if (params.type === 'contribution') {
      if (params.parsedTaxAmount < 0) {
        params.setError('Tax amount cannot be negative');
        return;
      }
      if (params.parsedTaxAmount > params.parsedAmount) {
        params.setError('Tax amount cannot exceed contribution amount');
        return;
      }
    }

    const payload = buildPensionTxnPayload({
      potId: params.potId,
      type: params.type,
      amount: params.parsedAmount,
      taxAmount: params.type === 'contribution' ? params.parsedTaxAmount : 0,
      annualStatementDirection: params.annualStatementDirection,
      date: params.date,
      note: params.note,
      isEmployer: params.isEmployer,
    });

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
  const [taxAmount, setTaxAmount] = useState(initialValues.taxAmount);
  const [annualStatementDirection, setAnnualStatementDirection] =
    useState<AnnualStatementDirection>(initialValues.annualStatementDirection);
  const [isEmployer, setIsEmployer] = useState(initialValues.isEmployer);
  const [date, setDate] = useState(initialValues.date);
  const [note, setNote] = useState(initialValues.note);
  const [error, setError] = useState('');

  const parsedAmount = parsePensionAmount(amount);
  const parsedTaxAmount = parsePensionAmount(taxAmount);

  const handleTypeChange = (nextType: PensionTxnType): void => {
    setType(nextType);
    setError('');
    setAmount('');
    setTaxAmount('');
    setAnnualStatementDirection('gain');
    setIsEmployer(true);
  };

  const handleSave = createPensionTxnSaveHandler({
    parsedAmount,
    parsedTaxAmount,
    setError,
    potId: pot.id,
    type,
    annualStatementDirection,
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
    taxAmount,
    annualStatementDirection,
    isEmployer,
    date,
    note,
    error,
    parsedAmount,
    parsedTaxAmount,
    fmtNative,
    setAmount,
    setTaxAmount,
    setAnnualStatementDirection,
    setIsEmployer,
    setDate,
    setNote,
    setError,
    handleTypeChange,
    handleSave,
  };
}
