import { useState } from 'react';
import { CircleMinus, DollarSign, Home, Landmark } from 'lucide-react';
import { useCurrency } from '@/lib/CurrencyContext';
import {
  Modal,
  ModalFooter,
  FormField,
  CurrencyInput,
  TxnTypeSelector,
  DateNoteRow,
} from '@/components/ui';
import type { TxnTypeMeta } from '@/components/ui';
import type { Property, PropertyTransaction } from '@quro/shared';
import { isInvestmentProperty, type PropertyTxnType } from '../utils/position';

type AddPropertyTxnModalProps = {
  property: Property;
  mortgageBalance: number;
  onClose: () => void;
  onSave: (t: Omit<PropertyTransaction, 'id'>) => void;
};

const PROPERTY_TXN_META: Record<PropertyTxnType, TxnTypeMeta> = {
  repayment: {
    key: 'repayment',
    label: 'Repayment',
    icon: Landmark,
    color: 'text-indigo-600',
    bg: 'bg-indigo-50',
    borderColor: 'border-indigo-300',
  },
  valuation: {
    key: 'valuation',
    label: 'Valuation',
    icon: Home,
    color: 'text-emerald-600',
    bg: 'bg-emerald-50',
    borderColor: 'border-emerald-300',
  },
  rent_income: {
    key: 'rent_income',
    label: 'Rent Income',
    icon: DollarSign,
    color: 'text-sky-600',
    bg: 'bg-sky-50',
    borderColor: 'border-sky-300',
  },
  expense: {
    key: 'expense',
    label: 'Expense',
    icon: CircleMinus,
    color: 'text-rose-500',
    bg: 'bg-rose-50',
    borderColor: 'border-rose-300',
  },
};

type PropertyTxnInfoBarProps = {
  type: PropertyTxnType;
  property: Property;
  mortgageBalance: number;
  fmtNative: (value: number, currency: string, compact?: boolean) => string;
};

function PropertyTxnInfoBar({
  type,
  property,
  mortgageBalance,
  fmtNative,
}: PropertyTxnInfoBarProps) {
  return (
    <div className="flex items-center gap-3 bg-slate-50 rounded-xl px-4 py-2.5 text-xs text-slate-600">
      {type === 'repayment' ? (
        <>
          <span>Current mortgage</span>
          <span className="text-slate-300">·</span>
          <span className="font-semibold text-slate-800">
            {fmtNative(mortgageBalance, property.currency)}
          </span>
        </>
      ) : type === 'valuation' ? (
        <>
          <span>Current value</span>
          <span className="text-slate-300">·</span>
          <span className="font-semibold text-slate-800">
            {fmtNative(property.currentValue, property.currency)}
          </span>
        </>
      ) : type === 'rent_income' ? (
        <>
          <span>Monthly rent target</span>
          <span className="text-slate-300">·</span>
          <span className="font-semibold text-slate-800">
            {fmtNative(property.monthlyRent, property.currency)}
          </span>
        </>
      ) : (
        <>
          <span>Property value</span>
          <span className="text-slate-300">·</span>
          <span className="font-semibold text-slate-800">
            {fmtNative(property.currentValue, property.currency)}
          </span>
        </>
      )}
    </div>
  );
}

type PropertyTxnPreviewProps = {
  type: PropertyTxnType;
  parsedAmount: number;
  parsedInterest: number;
  derivedPrincipal: number;
  property: Property;
  mortgageBalance: number;
  fmtNative: (value: number, currency: string, compact?: boolean) => string;
};

type PreviewFmt = (value: number, currency: string, compact?: boolean) => string;

type RepaymentPreviewProps = {
  parsedAmount: number;
  parsedInterest: number;
  derivedPrincipal: number;
  mortgageBalance: number;
  currency: string;
  fmtNative: PreviewFmt;
};

function RepaymentPreview({
  parsedAmount, parsedInterest, derivedPrincipal, mortgageBalance, currency, fmtNative,
}: RepaymentPreviewProps) {
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-xs">
        <span className="text-slate-600">Total payment</span>
        <span className="font-semibold text-slate-800">{fmtNative(parsedAmount, currency, true)}</span>
      </div>
      <div className="flex justify-between text-xs">
        <span className="text-slate-600">Interest (cost)</span>
        <span className="font-semibold text-rose-500">{fmtNative(parsedInterest, currency, true)}</span>
      </div>
      <div className="flex justify-between text-xs">
        <span className="text-slate-600">Principal (reduces mortgage)</span>
        <span className="font-semibold text-indigo-600">-{fmtNative(derivedPrincipal, currency, true)}</span>
      </div>
      <div className="flex justify-between text-xs border-t border-indigo-100 pt-1.5 mt-1">
        <span className="text-slate-600">New mortgage balance</span>
        <span className="font-semibold text-slate-800">
          {fmtNative(Math.max(0, mortgageBalance - derivedPrincipal), currency, true)}
        </span>
      </div>
    </div>
  );
}

type ValuationPreviewProps = {
  parsedAmount: number;
  currentValue: number;
  currency: string;
  fmtNative: PreviewFmt;
};

function ValuationPreview({ parsedAmount, currentValue, currency, fmtNative }: ValuationPreviewProps) {
  const isUp = parsedAmount >= currentValue;
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-xs">
        <span className="text-slate-600">Previous value</span>
        <span className="font-semibold text-slate-800">{fmtNative(currentValue, currency, true)}</span>
      </div>
      <div className="flex justify-between text-xs">
        <span className="text-slate-600">New value</span>
        <span className={`font-semibold ${isUp ? 'text-emerald-600' : 'text-rose-500'}`}>
          {fmtNative(parsedAmount, currency, true)}
        </span>
      </div>
      <div className="flex justify-between text-xs">
        <span className="text-slate-600">Change</span>
        <span className={`font-semibold ${isUp ? 'text-emerald-600' : 'text-rose-500'}`}>
          {isUp ? '+' : ''}{fmtNative(parsedAmount - currentValue, currency, true)}
        </span>
      </div>
    </div>
  );
}

type RentExpensePreviewProps = {
  type: 'rent_income' | 'expense';
  parsedAmount: number;
  monthlyRent: number;
  currency: string;
  fmtNative: PreviewFmt;
};

function RentExpensePreview({ type, parsedAmount, monthlyRent, currency, fmtNative }: RentExpensePreviewProps) {
  if (type === 'rent_income') {
    const diff = parsedAmount - monthlyRent;
    return (
      <div className="space-y-1.5">
        <div className="flex justify-between text-xs">
          <span className="text-slate-600">Income booked</span>
          <span className="font-semibold text-sky-700">+{fmtNative(parsedAmount, currency, true)}</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-slate-600">Vs monthly target</span>
          <span className={`font-semibold ${diff >= 0 ? 'text-emerald-600' : 'text-amber-600'}`}>
            {diff >= 0 ? '+' : ''}{fmtNative(diff, currency, true)}
          </span>
        </div>
      </div>
    );
  }
  const net = monthlyRent - parsedAmount;
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-xs">
        <span className="text-slate-600">Expense booked</span>
        <span className="font-semibold text-rose-600">-{fmtNative(parsedAmount, currency, true)}</span>
      </div>
      <div className="flex justify-between text-xs">
        <span className="text-slate-600">Net vs monthly rent</span>
        <span className={`font-semibold ${net >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
          {net >= 0 ? '+' : ''}{fmtNative(net, currency, true)}
        </span>
      </div>
    </div>
  );
}

function getPreviewBgClass(type: PropertyTxnType): string {
  if (type === 'valuation') return 'bg-emerald-50 border-emerald-100';
  if (type === 'rent_income') return 'bg-sky-50 border-sky-100';
  if (type === 'expense') return 'bg-rose-50 border-rose-100';
  return 'bg-indigo-50 border-indigo-100';
}

function PropertyTxnPreview({
  type,
  parsedAmount,
  parsedInterest,
  derivedPrincipal,
  property,
  mortgageBalance,
  fmtNative,
}: PropertyTxnPreviewProps) {
  return (
    <div className={`rounded-xl p-4 border ${getPreviewBgClass(type)}`}>
      {type === 'repayment' && (
        <RepaymentPreview
          parsedAmount={parsedAmount}
          parsedInterest={parsedInterest}
          derivedPrincipal={derivedPrincipal}
          mortgageBalance={mortgageBalance}
          currency={property.currency}
          fmtNative={fmtNative}
        />
      )}
      {type === 'valuation' && (
        <ValuationPreview
          parsedAmount={parsedAmount}
          currentValue={property.currentValue}
          currency={property.currency}
          fmtNative={fmtNative}
        />
      )}
      {(type === 'rent_income' || type === 'expense') && (
        <RentExpensePreview
          type={type}
          parsedAmount={parsedAmount}
          monthlyRent={property.monthlyRent}
          currency={property.currency}
          fmtNative={fmtNative}
        />
      )}
    </div>
  );
}

function getAmountLabel(type: PropertyTxnType, currency: string) {
  if (type === 'valuation') return `New Estimated Value (${currency})`;
  if (type === 'repayment') return `Total Repayment Amount (${currency})`;
  if (type === 'rent_income') return `Rent Received (${currency})`;
  return `Property Expense (${currency})`;
}

function getNotePlaceholder(type: PropertyTxnType) {
  if (type === 'rent_income') return 'e.g. Monthly rent';
  if (type === 'expense') return 'e.g. Repair invoice';
  return 'e.g. Monthly repayment';
}

function validateRepayment(
  type: PropertyTxnType,
  mortgageBalance: number,
  parsedInterest: number,
  parsedAmount: number,
): string {
  if (type !== 'repayment') return '';
  if (mortgageBalance <= 0) return 'Link a mortgage to record repayments';
  if (parsedInterest < 0) return 'Interest cannot be negative';
  if (parsedInterest > parsedAmount) return 'Interest cannot exceed total payment';
  return '';
}

type RepaymentFieldProps = {
  property: Property;
  interest: string;
  parsedInterest: number;
  parsedAmount: number;
  derivedPrincipal: number;
  error: string;
  fmtNative: (value: number, currency: string, compact?: boolean) => string;
  onInterestChange: (value: string) => void;
};

function RepaymentField({
  property, interest, parsedInterest, parsedAmount, derivedPrincipal, error, fmtNative, onInterestChange,
}: RepaymentFieldProps) {
  return (
    <FormField
      label={`Interest Portion (${property.currency})`}
      hint="— principal is auto-calculated"
      error={error && parsedInterest > parsedAmount ? error : undefined}
    >
      <CurrencyInput
        currency={property.currency}
        value={interest}
        onChange={onInterestChange}
        error={Boolean(error) && parsedInterest > parsedAmount}
      />
      <div className="mt-2 flex gap-4 text-xs text-slate-500">
        <span>
          Interest:{' '}
          <span className="font-semibold text-rose-500">
            {fmtNative(parsedInterest, property.currency, true)}
          </span>
        </span>
        <span>
          Principal:{' '}
          <span className="font-semibold text-indigo-600">
            {fmtNative(derivedPrincipal, property.currency, true)}
          </span>
        </span>
      </div>
    </FormField>
  );
}

function usePropertyTxnForm(property: Property) {
  const supportsCashflowTxns = isInvestmentProperty(property.propertyType);
  const transactionTypes = supportsCashflowTxns
    ? (['repayment', 'valuation', 'rent_income', 'expense'] as PropertyTxnType[])
    : (['repayment', 'valuation'] as PropertyTxnType[]);

  const [type, setType] = useState<PropertyTxnType>(transactionTypes[0] ?? 'repayment');
  const [amount, setAmount] = useState('');
  const [interest, setInterest] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  const parsedAmount = parseFloat(amount) || 0;
  const parsedInterest = parseFloat(interest) || 0;
  const derivedPrincipal = Math.max(0, parsedAmount - parsedInterest);

  function handleTypeChange(txnType: PropertyTxnType) {
    setType(txnType);
    setError('');
    setAmount('');
    setInterest('');
  }

  return {
    transactionTypes, type, amount, interest, date, note, error,
    parsedAmount, parsedInterest, derivedPrincipal,
    setAmount, setInterest, setDate, setNote, setError, handleTypeChange,
  };
}

type PropertyTxnFormBodyProps = {
  form: ReturnType<typeof usePropertyTxnForm>;
  property: Property;
  mortgageBalance: number;
  fmtNative: (value: number, currency: string, compact?: boolean) => string;
};

function PropertyTxnFormBody({ form, property, mortgageBalance, fmtNative }: PropertyTxnFormBodyProps) {
  const { type, amount, interest, date, note, error, parsedAmount, parsedInterest, derivedPrincipal } = form;
  return (
    <>
      <FormField label="Transaction Type">
        <TxnTypeSelector<PropertyTxnType>
          types={form.transactionTypes.map((txnType) => PROPERTY_TXN_META[txnType])}
          value={type}
          onChange={form.handleTypeChange}
          columns={2}
        />
      </FormField>
      <PropertyTxnInfoBar type={type} property={property} mortgageBalance={mortgageBalance} fmtNative={fmtNative} />
      <FormField label={getAmountLabel(type, property.currency)} error={error && parsedAmount <= 0 ? error : undefined}>
        <CurrencyInput
          currency={property.currency}
          value={amount}
          onChange={(value) => { form.setAmount(value); form.setError(''); }}
          error={Boolean(error) && parsedAmount <= 0}
        />
      </FormField>
      {type === 'repayment' && (
        <RepaymentField
          property={property}
          interest={interest}
          parsedInterest={parsedInterest}
          parsedAmount={parsedAmount}
          derivedPrincipal={derivedPrincipal}
          error={error}
          fmtNative={fmtNative}
          onInterestChange={(value) => { form.setInterest(value); form.setError(''); }}
        />
      )}
      {error && parsedAmount > 0 && <p className="text-xs text-rose-500">{error}</p>}
      <DateNoteRow date={date} note={note} onDateChange={form.setDate} onNoteChange={form.setNote} notePlaceholder={getNotePlaceholder(type)} />
      {parsedAmount > 0 && (
        <PropertyTxnPreview
          type={type}
          parsedAmount={parsedAmount}
          parsedInterest={parsedInterest}
          derivedPrincipal={derivedPrincipal}
          property={property}
          mortgageBalance={mortgageBalance}
          fmtNative={fmtNative}
        />
      )}
    </>
  );
}

export function AddPropertyTxnModal({
  property,
  mortgageBalance,
  onClose,
  onSave,
}: AddPropertyTxnModalProps) {
  const { fmtNative } = useCurrency();
  const form = usePropertyTxnForm(property);

  function handleSave() {
    if (form.parsedAmount <= 0) { form.setError('Enter a valid amount'); return; }
    const repaymentError = validateRepayment(form.type, mortgageBalance, form.parsedInterest, form.parsedAmount);
    if (repaymentError) { form.setError(repaymentError); return; }
    onSave({
      propertyId: property.id,
      type: form.type,
      amount: form.parsedAmount,
      interest: form.type === 'repayment' ? form.parsedInterest : null,
      principal: form.type === 'repayment' ? form.derivedPrincipal : null,
      date: form.date,
      note: form.note,
    });
    onClose();
  }

  return (
    <Modal
      title="Record Transaction"
      subtitle={`${property.emoji} ${property.address}`}
      onClose={onClose}
      footer={<ModalFooter onCancel={onClose} onConfirm={handleSave} confirmLabel="Record" />}
    >
      <PropertyTxnFormBody form={form} property={property} mortgageBalance={mortgageBalance} fmtNative={fmtNative} />
    </Modal>
  );
}
