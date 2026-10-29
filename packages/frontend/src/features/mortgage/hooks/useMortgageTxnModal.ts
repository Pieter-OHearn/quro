import { useState } from 'react';
import {
  todayIsoDate,
  type Mortgage as MortgageType,
  type MortgageTransaction,
  validateInterestWithinAmount,
  MAX_RATE_CHANGE_PERCENT,
} from '@quro/shared';
import { formatFixedInputValue } from '@/lib/utils';
import type { MortgageTxnType, SaveMortgageTxnInput } from '../types';
import {
  nextRepaymentDate,
  repaymentNote,
  suggestRepayment,
  type RepaymentSuggestion,
} from '../utils/repayment-suggestion';

type UseMortgageTxnModalParams = {
  mortgage: MortgageType;
  /** The mortgage's ledger: the latest repayment and the rate changes shape the suggestion. */
  transactions: readonly MortgageTransaction[];
  existing?: MortgageTransaction;
  onSave: (t: SaveMortgageTxnInput) => void;
  onClose: () => void;
};

/** The fields a new repayment pre-fills; one the user changed keeps the user's value. */
type SuggestedField = 'amount' | 'interest' | 'date' | 'note';

function validateTxn(
  type: MortgageTxnType,
  parsedAmount: number,
  parsedInterest: number,
  parsedFixedYears: number,
): string {
  if (parsedAmount <= 0) return 'Enter a valid amount';
  if (type === 'repayment') {
    const splitError = validateInterestWithinAmount(parsedAmount, parsedInterest);
    if (splitError) return splitError;
  }
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

function emptyTxnFormValues() {
  return {
    type: 'repayment' as MortgageTxnType,
    amount: '',
    interest: '',
    fixedYears: '',
    date: todayIsoDate(),
    note: '',
  };
}

function getInitialTxnFormValues(existing?: MortgageTransaction) {
  if (!existing) return emptyTxnFormValues();
  return {
    type: existing.type,
    amount: formatFixedInputValue(existing.amount),
    interest: existing.interest != null ? formatFixedInputValue(existing.interest) : '',
    fixedYears: existing.fixedYears != null ? String(existing.fixedYears) : '',
    date: existing.date,
    note: existing.note,
  };
}

function useMortgageTxnFormState(existing?: MortgageTransaction) {
  const initial = getInitialTxnFormValues(existing);
  const [type, setType] = useState<MortgageTxnType>(initial.type);
  const [amount, setAmount] = useState(initial.amount);
  const [interest, setInterest] = useState(initial.interest);
  const [fixedYears, setFixedYears] = useState(initial.fixedYears);
  const [date, setDate] = useState(initial.date);
  const [note, setNote] = useState(initial.note);
  const [error, setError] = useState('');
  // An edited transaction keeps what was recorded: every field counts as the user's.
  const [touched, setTouched] = useState<ReadonlySet<SuggestedField>>(
    () => new Set(existing ? (['amount', 'interest', 'date', 'note'] as const) : []),
  );
  const touch = (field: SuggestedField) =>
    setTouched((previous) => (previous.has(field) ? previous : new Set([...previous, field])));

  return {
    type,
    setType,
    amount,
    setAmount: (value: string) => {
      setAmount(value);
      touch('amount');
    },
    interest,
    setInterest: (value: string) => {
      setInterest(value);
      touch('interest');
    },
    fixedYears,
    setFixedYears,
    date,
    setDate: (value: string) => {
      setDate(value);
      touch('date');
    },
    note,
    setNote: (value: string) => {
      setNote(value);
      touch('note');
    },
    error,
    setError,
    touched,
    resetSuggestion: () => setTouched(new Set()),
    clearValues: () => {
      setAmount('');
      setInterest('');
      setFixedYears('');
      setTouched(new Set());
    },
  };
}

type FormState = ReturnType<typeof useMortgageTxnFormState>;

// A new repayment starts from what the loan expects: dated a month after the latest repayment,
// noted with its month, its amount and interest from the rate and loan type. Each field the
// user has not changed follows the suggestion, so a new date also moves the note and the rate.
function resolveRepaymentSuggestion(
  form: FormState,
  mortgage: MortgageType,
  transactions: readonly MortgageTransaction[],
  existing: MortgageTransaction | undefined,
) {
  const suggests = !existing && form.type === 'repayment';
  const date =
    form.touched.has('date') || !suggests
      ? form.date
      : nextRepaymentDate(transactions, todayIsoDate());
  const suggestion: RepaymentSuggestion | null = suggests
    ? suggestRepayment(mortgage, transactions, date)
    : null;
  const pick = (field: SuggestedField, own: string, suggested: string) =>
    suggestion && !form.touched.has(field) ? suggested : own;
  return {
    suggestion,
    date,
    amount: pick('amount', form.amount, suggestion ? formatFixedInputValue(suggestion.amount) : ''),
    interest: pick(
      'interest',
      form.interest,
      suggestion ? formatFixedInputValue(suggestion.interest) : '',
    ),
    note: pick('note', form.note, repaymentNote(date)),
    // The reset link restores every field the user changed.
    canReset: suggestion !== null && form.touched.size > 0,
  };
}

export function useMortgageTxnModal({
  mortgage,
  transactions,
  existing,
  onSave,
  onClose,
}: UseMortgageTxnModalParams) {
  const formState = useMortgageTxnFormState(existing);
  const { type, fixedYears } = formState;
  const { setType, setError } = formState;
  const suggested = resolveRepaymentSuggestion(formState, mortgage, transactions, existing);
  const { amount, interest, date, note } = suggested;

  const parsedAmount = parseFloat(amount) || 0;
  const parsedInterest = parseFloat(interest) || 0;
  const parsedFixedYears = parseFloat(fixedYears) || 0;
  const derivedPrincipal = Math.max(0, parsedAmount - parsedInterest);
  const computedFixedUntil = computeFixedUntil(date, parsedFixedYears);

  const handleTypeChange = (nextType: MortgageTxnType) => {
    setType(nextType);
    setError('');
    formState.clearValues();
  };

  const handleSave = () => {
    const err = validateTxn(type, parsedAmount, parsedInterest, parsedFixedYears);
    if (err) {
      setError(err);
      return;
    }

    const payload = {
      mortgageId: mortgage.id,
      type,
      amount: parsedAmount,
      interest: type === 'repayment' ? parsedInterest : null,
      principal: type === 'repayment' ? derivedPrincipal : null,
      fixedYears: type === 'rate_change' ? parsedFixedYears : null,
      date,
      note,
    };
    onSave(existing ? { id: existing.id, ...payload } : payload);
    onClose();
  };

  return {
    ...formState,
    amount,
    interest,
    date,
    note,
    suggestion: suggested.suggestion,
    canResetSuggestion: suggested.canReset,
    parsedAmount,
    parsedInterest,
    parsedFixedYears,
    derivedPrincipal,
    computedFixedUntil,
    handleTypeChange,
    handleSave,
  };
}
