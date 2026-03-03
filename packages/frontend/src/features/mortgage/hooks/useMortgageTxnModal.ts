import { useState } from 'react';
import type { Mortgage as MortgageType, MortgageTransaction } from '@quro/shared';
import type { MortgageTxnType } from '../types';

type UseMortgageTxnModalParams = {
  mortgage: MortgageType;
  onSave: (t: Omit<MortgageTransaction, 'id'>) => void;
  onClose: () => void;
};

const MAX_RATE_CHANGE_PERCENT = 25;
const ISO_DATE_LENGTH = 10;

function validateTxn(
  type: MortgageTxnType,
  parsedAmount: number,
  parsedInterest: number,
  parsedFixedYears: number,
): string {
  if (parsedAmount <= 0) return 'Enter a valid amount';
  if (type === 'repayment' && parsedInterest > parsedAmount)
    return 'Interest cannot exceed total repayment';
  if (type === 'rate_change' && (parsedAmount <= 0 || parsedAmount > MAX_RATE_CHANGE_PERCENT))
    return `Enter a valid interest rate (0-${MAX_RATE_CHANGE_PERCENT}%)`;
  if (type === 'rate_change' && parsedFixedYears <= 0)
    return 'Enter the number of years the rate is fixed for';
  return '';
}

function computeFixedUntil(date: string, parsedFixedYears: number): string | null {
  if (!date || parsedFixedYears <= 0) return null;
  const d = new Date(date);
  d.setFullYear(d.getFullYear() + Math.floor(parsedFixedYears));
  if (parsedFixedYears % 1 !== 0) {
    d.setMonth(d.getMonth() + Math.round((parsedFixedYears % 1) * 12));
  }
  return d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

function useMortgageTxnFormState() {
  const [type, setType] = useState<MortgageTxnType>('repayment');
  const [amount, setAmount] = useState('');
  const [interest, setInterest] = useState('');
  const [fixedYears, setFixedYears] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, ISO_DATE_LENGTH));
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  return {
    type,
    setType,
    amount,
    setAmount,
    interest,
    setInterest,
    fixedYears,
    setFixedYears,
    date,
    setDate,
    note,
    setNote,
    error,
    setError,
  };
}

export function useMortgageTxnModal({ mortgage, onSave, onClose }: UseMortgageTxnModalParams) {
  const formState = useMortgageTxnFormState();
  const { type, amount, interest, fixedYears, date, note } = formState;
  const { setType, setError, setAmount, setInterest, setFixedYears } = formState;

  const parsedAmount = parseFloat(amount) || 0;
  const parsedInterest = parseFloat(interest) || 0;
  const parsedFixedYears = parseFloat(fixedYears) || 0;
  const derivedPrincipal = Math.max(0, parsedAmount - parsedInterest);
  const computedFixedUntil = computeFixedUntil(date, parsedFixedYears);

  const handleTypeChange = (nextType: MortgageTxnType) => {
    setType(nextType);
    setError('');
    setAmount('');
    setInterest('');
    setFixedYears('');
  };

  const handleSave = () => {
    const err = validateTxn(type, parsedAmount, parsedInterest, parsedFixedYears);
    if (err) {
      setError(err);
      return;
    }

    onSave({
      mortgageId: mortgage.id,
      type,
      amount: parsedAmount,
      interest: type === 'repayment' ? parsedInterest : null,
      principal: type === 'repayment' ? derivedPrincipal : null,
      fixedYears: type === 'rate_change' ? parsedFixedYears : null,
      date,
      note,
    });
    onClose();
  };

  return {
    ...formState,
    parsedAmount,
    parsedInterest,
    parsedFixedYears,
    derivedPrincipal,
    computedFixedUntil,
    handleTypeChange,
    handleSave,
  };
}
