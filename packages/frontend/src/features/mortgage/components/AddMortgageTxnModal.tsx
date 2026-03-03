import { useState } from 'react';
import { X } from 'lucide-react';
import { useCurrency } from '@/lib/CurrencyContext';
import type { Mortgage as MortgageType, MortgageTransaction } from '@quro/shared';
import { TXN_META, type MortgageTxnType } from './txnMeta';

type AddMortgageTxnModalProps = {
  mortgage: MortgageType;
  onClose: () => void;
  onSave: (t: Omit<MortgageTransaction, 'id'>) => void;
};

const MAX_RATE_CHANGE_PERCENT = 25;

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

// ─── Type Selector ────────────────────────────────────────────────────────────

type TypeSelectorProps = {
  type: MortgageTxnType;
  onTypeChange: (t: MortgageTxnType) => void;
};

function TxnTypeSelector({ type, onTypeChange }: TypeSelectorProps) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-600 mb-2">Transaction Type</label>
      <div className="grid grid-cols-3 gap-2">
        {(['repayment', 'valuation', 'rate_change'] as MortgageTxnType[]).map((t) => {
          const meta = TXN_META[t];
          const Icon = meta.icon;
          const active = type === t;
          return (
            <button
              key={t}
              onClick={() => onTypeChange(t)}
              className={`flex flex-col items-center gap-1.5 py-3 rounded-xl border-2 transition-all ${
                active
                  ? `${meta.borderColor} ${meta.bg} ${meta.color}`
                  : 'border-slate-200 text-slate-400 hover:border-slate-300 hover:bg-slate-50'
              }`}
            >
              <Icon size={15} />
              <span className="text-[10px] font-semibold leading-tight text-center">
                {meta.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Context Info Pill ────────────────────────────────────────────────────────

type ContextPillProps = {
  type: MortgageTxnType;
  mortgage: MortgageType;
  fmt: (n: number) => string;
};

function ContextPill({ type, mortgage, fmt }: ContextPillProps) {
  return (
    <div className="flex items-center gap-3 bg-slate-50 rounded-xl px-4 py-2.5 text-xs text-slate-600">
      {type === 'repayment' && (
        <>
          <span>Current balance</span>
          <span className="text-slate-300">·</span>
          <span className="font-semibold text-slate-800">{fmt(mortgage.outstandingBalance)}</span>
        </>
      )}
      {type === 'valuation' && (
        <>
          <span>Current value</span>
          <span className="text-slate-300">·</span>
          <span className="font-semibold text-slate-800">{fmt(mortgage.propertyValue)}</span>
        </>
      )}
      {type === 'rate_change' && (
        <>
          <span>Current rate</span>
          <span className="text-slate-300">·</span>
          <span className="font-semibold text-slate-800">{mortgage.interestRate}%</span>
        </>
      )}
    </div>
  );
}

// ─── Live Preview ─────────────────────────────────────────────────────────────

type LivePreviewProps = {
  type: MortgageTxnType;
  parsedAmount: number;
  parsedInterest: number;
  derivedPrincipal: number;
  computedFixedUntil: string | null;
  mortgage: MortgageType;
  fmt: (n: number) => string;
};

function RepaymentPreview({
  parsedAmount,
  parsedInterest,
  derivedPrincipal,
  mortgage,
  fmt,
}: Omit<LivePreviewProps, 'type' | 'computedFixedUntil'>) {
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-xs">
        <span className="text-slate-600">Total payment</span>
        <span className="font-semibold text-slate-800">{fmt(parsedAmount)}</span>
      </div>
      <div className="flex justify-between text-xs">
        <span className="text-slate-600">Interest (cost)</span>
        <span className="font-semibold text-rose-500">{fmt(parsedInterest)}</span>
      </div>
      <div className="flex justify-between text-xs">
        <span className="text-slate-600">Principal (reduces balance)</span>
        <span className="font-semibold text-indigo-600">−{fmt(derivedPrincipal)}</span>
      </div>
      <div className="flex justify-between text-xs border-t border-indigo-100 pt-1.5 mt-1">
        <span className="text-slate-600">New balance</span>
        <span className="font-semibold text-slate-800">
          {fmt(Math.max(0, mortgage.outstandingBalance - derivedPrincipal))}
        </span>
      </div>
    </div>
  );
}

function ValuationPreview({
  parsedAmount,
  mortgage,
  fmt,
}: Pick<LivePreviewProps, 'parsedAmount' | 'mortgage' | 'fmt'>) {
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-xs">
        <span className="text-slate-600">Previous value</span>
        <span className="font-semibold text-slate-800">{fmt(mortgage.propertyValue)}</span>
      </div>
      <div className="flex justify-between text-xs">
        <span className="text-slate-600">New value</span>
        <span
          className={`font-semibold ${parsedAmount >= mortgage.propertyValue ? 'text-emerald-600' : 'text-rose-500'}`}
        >
          {fmt(parsedAmount)}
        </span>
      </div>
      <div className="flex justify-between text-xs">
        <span className="text-slate-600">Change</span>
        <span
          className={`font-semibold ${parsedAmount >= mortgage.propertyValue ? 'text-emerald-600' : 'text-rose-500'}`}
        >
          {parsedAmount >= mortgage.propertyValue ? '+' : ''}
          {fmt(parsedAmount - mortgage.propertyValue)}
        </span>
      </div>
      <div className="flex justify-between text-xs border-t border-emerald-100 pt-1.5 mt-1">
        <span className="text-slate-600">New LTV</span>
        <span className="font-semibold text-slate-800">
          {((mortgage.outstandingBalance / parsedAmount) * 100).toFixed(1)}%
        </span>
      </div>
    </div>
  );
}

function RateChangePreview({
  parsedAmount,
  computedFixedUntil,
  mortgage,
  fmt,
}: Pick<LivePreviewProps, 'parsedAmount' | 'computedFixedUntil' | 'mortgage' | 'fmt'>) {
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-xs">
        <span className="text-slate-600">Previous rate</span>
        <span className="font-semibold text-slate-800">{mortgage.interestRate}%</span>
      </div>
      <div className="flex justify-between text-xs">
        <span className="text-slate-600">New rate</span>
        <span
          className={`font-semibold ${parsedAmount <= mortgage.interestRate ? 'text-emerald-600' : 'text-rose-500'}`}
        >
          {parsedAmount}%
        </span>
      </div>
      <div className="flex justify-between text-xs">
        <span className="text-slate-600">Monthly interest est.</span>
        <span className="font-semibold text-slate-800">
          {fmt((mortgage.outstandingBalance * parsedAmount) / 100 / 12)}
        </span>
      </div>
      {computedFixedUntil && (
        <div className="flex justify-between text-xs border-t border-amber-100 pt-1.5 mt-1">
          <span className="text-slate-600">Fixed until</span>
          <span className="font-semibold text-amber-600">{computedFixedUntil}</span>
        </div>
      )}
    </div>
  );
}

function LivePreview(props: LivePreviewProps) {
  const { type, parsedAmount } = props;
  if (parsedAmount <= 0) return null;
  const bgClass =
    type === 'valuation'
      ? 'bg-emerald-50 border-emerald-100'
      : type === 'rate_change'
        ? 'bg-amber-50 border-amber-100'
        : 'bg-indigo-50 border-indigo-100';
  return (
    <div className={`rounded-xl p-4 border ${bgClass}`}>
      {type === 'repayment' && <RepaymentPreview {...props} />}
      {type === 'valuation' && <ValuationPreview {...props} />}
      {type === 'rate_change' && <RateChangePreview {...props} />}
    </div>
  );
}

// ─── Custom Hook ─────────────────────────────────────────────────────────────

function useMortgageTxnFormState() {
  const [type, setType] = useState<MortgageTxnType>('repayment');
  const [amount, setAmount] = useState('');
  const [interest, setInterest] = useState('');
  const [fixedYears, setFixedYears] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
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

function useMortgageTxnModal(
  mortgage: MortgageType,
  onSave: AddMortgageTxnModalProps['onSave'],
  onClose: () => void,
) {
  const formState = useMortgageTxnFormState();
  const { type, amount, interest, fixedYears, date, note } = formState;
  const { setType, setError, setAmount, setInterest, setFixedYears } = formState;
  const parsedAmount = parseFloat(amount) || 0;
  const parsedInterest = parseFloat(interest) || 0;
  const parsedFixedYears = parseFloat(fixedYears) || 0;
  const derivedPrincipal = Math.max(0, parsedAmount - parsedInterest);
  const computedFixedUntil = computeFixedUntil(date, parsedFixedYears);
  const handleTypeChange = (t: MortgageTxnType) => {
    setType(t);
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

type TxnModalState = ReturnType<typeof useMortgageTxnModal>;

// ─── Form Sub-components ──────────────────────────────────────────────────────

type TxnAmountFieldProps = {
  type: MortgageTxnType;
  error: string;
  amount: string;
  mortgage: MortgageType;
  setAmount: (v: string) => void;
  setError: (v: string) => void;
};
function TxnAmountField({
  type,
  error,
  amount,
  mortgage,
  setAmount,
  setError,
}: TxnAmountFieldProps) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-600 mb-1.5">
        {type === 'repayment' && `Total Repayment Amount (${mortgage.currency})`}
        {type === 'valuation' && `New Estimated Value (${mortgage.currency})`}
        {type === 'rate_change' && 'New Interest Rate (%)'}
      </label>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-medium">
          {type === 'rate_change' ? '%' : mortgage.currency}
        </span>
        <input
          type="number"
          step="0.01"
          className={`w-full rounded-xl border pl-12 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 ${error ? 'border-rose-300 bg-rose-50' : 'border-slate-200 bg-slate-50'}`}
          placeholder={type === 'rate_change' ? '4.25' : '0.00'}
          value={amount}
          onChange={(e) => {
            setAmount(e.target.value);
            setError('');
          }}
        />
      </div>
    </div>
  );
}

type RateChangeFieldsProps = {
  error: string;
  parsedFixedYears: number;
  fixedYears: string;
  computedFixedUntil: string | null;
  setFixedYears: (v: string) => void;
  setError: (v: string) => void;
};
function RateChangeFields({
  error,
  parsedFixedYears,
  fixedYears,
  computedFixedUntil,
  setFixedYears,
  setError,
}: RateChangeFieldsProps) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-600 mb-1.5">
        Fixed Period{' '}
        <span className="text-slate-400 font-normal">— how long is this rate fixed for?</span>
      </label>
      <div className="relative">
        <input
          type="number"
          step="0.5"
          min="0.5"
          max="30"
          className={`w-full rounded-xl border pl-4 pr-16 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 ${error && parsedFixedYears <= 0 ? 'border-rose-300 bg-rose-50' : 'border-slate-200 bg-slate-50'}`}
          placeholder="e.g. 2"
          value={fixedYears}
          onChange={(e) => {
            setFixedYears(e.target.value);
            setError('');
          }}
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-medium">
          years
        </span>
      </div>
      {computedFixedUntil && (
        <p className="mt-1.5 text-xs text-slate-500">
          Fixed until <span className="font-semibold text-amber-600">{computedFixedUntil}</span>
        </p>
      )}
    </div>
  );
}

type RepaymentInterestFieldProps = {
  error: string;
  parsedInterest: number;
  parsedAmount: number;
  derivedPrincipal: number;
  interest: string;
  mortgage: MortgageType;
  fmt: (n: number) => string;
  setInterest: (v: string) => void;
  setError: (v: string) => void;
};
function RepaymentInterestField({
  error,
  parsedInterest,
  parsedAmount,
  derivedPrincipal,
  interest,
  mortgage,
  fmt,
  setInterest,
  setError,
}: RepaymentInterestFieldProps) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-600 mb-1.5">
        Interest Portion ({mortgage.currency}){' '}
        <span className="text-slate-400 font-normal">— principal is auto-calculated</span>
      </label>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-medium">
          {mortgage.currency}
        </span>
        <input
          type="number"
          step="0.01"
          className={`w-full rounded-xl border pl-12 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 ${error && parsedInterest > parsedAmount ? 'border-rose-300 bg-rose-50' : 'border-slate-200 bg-slate-50'}`}
          placeholder="0.00"
          value={interest}
          onChange={(e) => {
            setInterest(e.target.value);
            setError('');
          }}
        />
      </div>
      <div className="mt-2 flex gap-4 text-xs text-slate-500">
        <span>
          Interest: <span className="font-semibold text-rose-500">{fmt(parsedInterest)}</span>
        </span>
        <span>
          Principal: <span className="font-semibold text-indigo-600">{fmt(derivedPrincipal)}</span>
        </span>
      </div>
    </div>
  );
}

type TxnModalFormBodyProps = {
  state: TxnModalState;
  mortgage: MortgageType;
  fmt: (n: number) => string;
};
function TxnDateNoteRow({
  date,
  note,
  setDate,
  setNote,
}: Readonly<{
  date: string;
  note: string;
  setDate: (v: string) => void;
  setNote: (v: string) => void;
}>) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <div>
        <label className="block text-xs font-semibold text-slate-600 mb-1.5">Date</label>
        <input
          type="date"
          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </div>
      <div>
        <label className="block text-xs font-semibold text-slate-600 mb-1.5">
          Note <span className="text-slate-400 font-normal">optional</span>
        </label>
        <input
          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
          placeholder="e.g. Monthly repayment…"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>
    </div>
  );
}

function TxnConditionalFields({ state, mortgage, fmt }: TxnModalFormBodyProps) {
  const { type, error, parsedFixedYears, fixedYears, computedFixedUntil, setFixedYears, setError } =
    state;
  const { parsedInterest, parsedAmount, derivedPrincipal, interest, setInterest } = state;
  return (
    <>
      {type === 'rate_change' && (
        <RateChangeFields
          error={error}
          parsedFixedYears={parsedFixedYears}
          fixedYears={fixedYears}
          computedFixedUntil={computedFixedUntil}
          setFixedYears={setFixedYears}
          setError={setError}
        />
      )}
      {type === 'repayment' && (
        <RepaymentInterestField
          error={error}
          parsedInterest={parsedInterest}
          parsedAmount={parsedAmount}
          derivedPrincipal={derivedPrincipal}
          interest={interest}
          mortgage={mortgage}
          fmt={fmt}
          setInterest={setInterest}
          setError={setError}
        />
      )}
    </>
  );
}

function TxnModalFormBody({ state, mortgage, fmt }: TxnModalFormBodyProps) {
  return (
    <div className="p-6 space-y-5">
      <TxnTypeSelector type={state.type} onTypeChange={state.handleTypeChange} />
      <ContextPill type={state.type} mortgage={mortgage} fmt={fmt} />
      <TxnAmountField
        type={state.type}
        error={state.error}
        amount={state.amount}
        mortgage={mortgage}
        setAmount={state.setAmount}
        setError={state.setError}
      />
      <TxnConditionalFields state={state} mortgage={mortgage} fmt={fmt} />
      {state.error && <p className="text-xs text-rose-500">{state.error}</p>}
      <TxnDateNoteRow
        date={state.date}
        note={state.note}
        setDate={state.setDate}
        setNote={state.setNote}
      />
      <LivePreview
        type={state.type}
        parsedAmount={state.parsedAmount}
        parsedInterest={state.parsedInterest}
        derivedPrincipal={state.derivedPrincipal}
        computedFixedUntil={state.computedFixedUntil}
        mortgage={mortgage}
        fmt={fmt}
      />
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function AddMortgageTxnModal({ mortgage, onClose, onSave }: AddMortgageTxnModalProps) {
  const { fmtBase } = useCurrency();
  const fmt = (v: number) => fmtBase(v);
  const state = useMortgageTxnModal(mortgage, onSave, onClose);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="bg-gradient-to-r from-[#0a0f1e] to-[#1a1f3e] px-6 py-5 flex items-center justify-between">
          <div>
            <h2 className="font-bold text-white">Record Transaction</h2>
            <p className="text-xs text-indigo-300 mt-0.5 truncate max-w-[240px]">
              🏠 {mortgage.propertyAddress}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
          >
            <X size={18} />
          </button>
        </div>
        <TxnModalFormBody state={state} mortgage={mortgage} fmt={fmt} />
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 rounded-xl border border-slate-200 text-slate-600 py-2.5 text-sm hover:bg-slate-100 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={state.handleSave}
            className="flex-1 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white py-2.5 text-sm transition-colors font-medium"
          >
            Record
          </button>
        </div>
      </div>
    </div>
  );
}
