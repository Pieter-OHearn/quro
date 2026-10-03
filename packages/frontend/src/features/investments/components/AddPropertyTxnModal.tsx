import { PROPERTY_TXN_META, PROPERTY_TXN_FORM } from '../constants';
import { useState } from 'react';
import { useCurrency } from '@/lib/CurrencyContext';
import { formatFixedInputValue } from '@/lib/utils';
import {
  Modal,
  ModalFooter,
  FormField,
  CurrencyInput,
  TxnTypeSelector,
  DateNoteRow,
} from '@/components/ui';
import {
  todayIsoDate,
  type Property,
  type PropertyTransaction,
  validateInterestWithinAmount,
} from '@quro/shared';
import type { SavePropertyTxnInput } from '../types';
import { isInvestmentProperty, type PropertyTxnType } from '../utils/position';

type AddPropertyTxnModalProps = {
  property: Property;
  mortgageBalance: number;
  existing?: PropertyTransaction;
  onClose: () => void;
  onSave: (t: SavePropertyTxnInput) => void;
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
    <div className="flex items-center gap-3 bg-surface-sunken rounded-xl px-4 py-2.5 text-xs text-fg-muted">
      {type === 'repayment' ? (
        <>
          <span>Current mortgage</span>
          <span className="text-fg-disabled">·</span>
          <span className="font-semibold text-fg-emphasis">
            {fmtNative(mortgageBalance, property.currency)}
          </span>
        </>
      ) : type === 'valuation' ? (
        <>
          <span>Current value</span>
          <span className="text-fg-disabled">·</span>
          <span className="font-semibold text-fg-emphasis">
            {fmtNative(property.currentValue, property.currency)}
          </span>
        </>
      ) : type === 'rent_income' ? (
        <>
          <span>Monthly rent target</span>
          <span className="text-fg-disabled">·</span>
          <span className="font-semibold text-fg-emphasis">
            {fmtNative(property.monthlyRent, property.currency)}
          </span>
        </>
      ) : (
        <>
          <span>Property value</span>
          <span className="text-fg-disabled">·</span>
          <span className="font-semibold text-fg-emphasis">
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
  parsedAmount,
  parsedInterest,
  derivedPrincipal,
  mortgageBalance,
  currency,
  fmtNative,
}: RepaymentPreviewProps) {
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-xs">
        <span className="text-fg-muted">Total payment</span>
        <span className="font-semibold text-fg-emphasis">
          {fmtNative(parsedAmount, currency, true)}
        </span>
      </div>
      <div className="flex justify-between text-xs">
        <span className="text-fg-muted">Interest (cost)</span>
        <span className="font-semibold text-danger">
          {fmtNative(parsedInterest, currency, true)}
        </span>
      </div>
      <div className="flex justify-between text-xs">
        <span className="text-fg-muted">Principal (reduces mortgage)</span>
        <span className="font-semibold text-brand">
          -{fmtNative(derivedPrincipal, currency, true)}
        </span>
      </div>
      <div className="flex justify-between text-xs border-t border-brand-soft-strong pt-1.5 mt-1">
        <span className="text-fg-muted">New mortgage balance</span>
        <span className="font-semibold text-fg-emphasis">
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

function ValuationPreview({
  parsedAmount,
  currentValue,
  currency,
  fmtNative,
}: ValuationPreviewProps) {
  const isUp = parsedAmount >= currentValue;
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-xs">
        <span className="text-fg-muted">Previous value</span>
        <span className="font-semibold text-fg-emphasis">
          {fmtNative(currentValue, currency, true)}
        </span>
      </div>
      <div className="flex justify-between text-xs">
        <span className="text-fg-muted">New value</span>
        <span className={`font-semibold ${isUp ? 'text-success' : 'text-danger'}`}>
          {fmtNative(parsedAmount, currency, true)}
        </span>
      </div>
      <div className="flex justify-between text-xs">
        <span className="text-fg-muted">Change</span>
        <span className={`font-semibold ${isUp ? 'text-success' : 'text-danger'}`}>
          {isUp ? '+' : ''}
          {fmtNative(parsedAmount - currentValue, currency, true)}
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

function RentExpensePreview({
  type,
  parsedAmount,
  monthlyRent,
  currency,
  fmtNative,
}: RentExpensePreviewProps) {
  if (type === 'rent_income') {
    const diff = parsedAmount - monthlyRent;
    return (
      <div className="space-y-1.5">
        <div className="flex justify-between text-xs">
          <span className="text-fg-muted">Income booked</span>
          <span className="font-semibold text-info-fg">
            +{fmtNative(parsedAmount, currency, true)}
          </span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-fg-muted">Vs monthly target</span>
          <span className={`font-semibold ${diff >= 0 ? 'text-success' : 'text-warning'}`}>
            {diff >= 0 ? '+' : ''}
            {fmtNative(diff, currency, true)}
          </span>
        </div>
      </div>
    );
  }
  const net = monthlyRent - parsedAmount;
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-xs">
        <span className="text-fg-muted">Expense booked</span>
        <span className="font-semibold text-danger-hover">
          -{fmtNative(parsedAmount, currency, true)}
        </span>
      </div>
      <div className="flex justify-between text-xs">
        <span className="text-fg-muted">Net vs monthly rent</span>
        <span className={`font-semibold ${net >= 0 ? 'text-success' : 'text-danger-hover'}`}>
          {net >= 0 ? '+' : ''}
          {fmtNative(net, currency, true)}
        </span>
      </div>
    </div>
  );
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
    <div className={`rounded-xl p-4 border ${PROPERTY_TXN_FORM[type].previewClass}`}>
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
  return `${PROPERTY_TXN_FORM[type].amountLabel} (${currency})`;
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
  return validateInterestWithinAmount(parsedAmount, parsedInterest) ?? '';
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
  property,
  interest,
  parsedInterest,
  parsedAmount,
  derivedPrincipal,
  error,
  fmtNative,
  onInterestChange,
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
      <div className="mt-2 flex gap-4 text-xs text-fg-subtle">
        <span>
          Interest:{' '}
          <span className="font-semibold text-danger">
            {fmtNative(parsedInterest, property.currency, true)}
          </span>
        </span>
        <span>
          Principal:{' '}
          <span className="font-semibold text-brand">
            {fmtNative(derivedPrincipal, property.currency, true)}
          </span>
        </span>
      </div>
    </FormField>
  );
}

function getSupportedPropertyTxnTypes(property: Property): PropertyTxnType[] {
  return isInvestmentProperty(property.propertyType)
    ? (['repayment', 'valuation', 'rent_income', 'expense'] as PropertyTxnType[])
    : (['repayment', 'valuation'] as PropertyTxnType[]);
}

function resolveInitialPropertyTxnType(
  transactionTypes: PropertyTxnType[],
  existing: PropertyTransaction | undefined,
): PropertyTxnType {
  const fallbackType = transactionTypes[0] ?? 'repayment';
  const initialType = existing?.type ?? fallbackType;
  return transactionTypes.includes(initialType) ? initialType : fallbackType;
}

function usePropertyTxnForm(property: Property, existing: PropertyTransaction | undefined) {
  const transactionTypes = getSupportedPropertyTxnTypes(property);
  const [type, setType] = useState<PropertyTxnType>(
    resolveInitialPropertyTxnType(transactionTypes, existing),
  );
  const [amount, setAmount] = useState(existing ? formatFixedInputValue(existing.amount) : '');
  const [interest, setInterest] = useState(
    existing?.interest != null ? formatFixedInputValue(existing.interest) : '',
  );
  const [date, setDate] = useState(existing?.date ?? todayIsoDate());
  const [note, setNote] = useState(existing?.note ?? '');
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
    transactionTypes,
    type,
    amount,
    interest,
    date,
    note,
    error,
    parsedAmount,
    parsedInterest,
    derivedPrincipal,
    setAmount,
    setInterest,
    setDate,
    setNote,
    setError,
    handleTypeChange,
  };
}

type PropertyTxnFormBodyProps = {
  form: ReturnType<typeof usePropertyTxnForm>;
  property: Property;
  mortgageBalance: number;
  fmtNative: (value: number, currency: string, compact?: boolean) => string;
};

type AmountAndRepaymentProps = {
  form: ReturnType<typeof usePropertyTxnForm>;
  property: Property;
  fmtNative: (value: number, currency: string, compact?: boolean) => string;
};

function AmountAndRepaymentFields({ form, property, fmtNative }: AmountAndRepaymentProps) {
  const { type, amount, interest, error, parsedAmount, parsedInterest, derivedPrincipal } = form;
  return (
    <>
      <FormField
        label={getAmountLabel(type, property.currency)}
        error={error && parsedAmount <= 0 ? error : undefined}
      >
        <CurrencyInput
          currency={property.currency}
          value={amount}
          onChange={(value) => {
            form.setAmount(value);
            form.setError('');
          }}
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
          onInterestChange={(value) => {
            form.setInterest(value);
            form.setError('');
          }}
        />
      )}
      {error && parsedAmount > 0 && <p className="text-xs text-danger">{error}</p>}
    </>
  );
}

function PropertyTxnFormBody({
  form,
  property,
  mortgageBalance,
  fmtNative,
}: PropertyTxnFormBodyProps) {
  return (
    <>
      <FormField label="Transaction Type">
        <TxnTypeSelector<PropertyTxnType>
          types={form.transactionTypes.map((txnType) => PROPERTY_TXN_META[txnType])}
          value={form.type}
          onChange={form.handleTypeChange}
          columns={2}
        />
      </FormField>
      <PropertyTxnInfoBar
        type={form.type}
        property={property}
        mortgageBalance={mortgageBalance}
        fmtNative={fmtNative}
      />
      <AmountAndRepaymentFields form={form} property={property} fmtNative={fmtNative} />
      <DateNoteRow
        date={form.date}
        note={form.note}
        onDateChange={form.setDate}
        onNoteChange={form.setNote}
        notePlaceholder={PROPERTY_TXN_FORM[form.type].notePlaceholder}
      />
      {form.parsedAmount > 0 && (
        <PropertyTxnPreview
          type={form.type}
          parsedAmount={form.parsedAmount}
          parsedInterest={form.parsedInterest}
          derivedPrincipal={form.derivedPrincipal}
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
  existing,
  onClose,
  onSave,
}: AddPropertyTxnModalProps) {
  const { fmtNative } = useCurrency();
  const form = usePropertyTxnForm(property, existing);
  const existingPrincipal =
    existing?.type === 'repayment'
      ? (existing.principal ?? Math.max(0, existing.amount - (existing.interest ?? 0)))
      : 0;
  const effectiveMortgageBalance = mortgageBalance + existingPrincipal;
  const isEditing = Boolean(existing);

  function handleSave() {
    if (form.parsedAmount <= 0) {
      form.setError('Enter a valid amount');
      return;
    }
    const repaymentError = validateRepayment(
      form.type,
      effectiveMortgageBalance,
      form.parsedInterest,
      form.parsedAmount,
    );
    if (repaymentError) {
      form.setError(repaymentError);
      return;
    }
    const payload = {
      propertyId: property.id,
      type: form.type,
      amount: form.parsedAmount,
      interest: form.type === 'repayment' ? form.parsedInterest : null,
      principal: form.type === 'repayment' ? form.derivedPrincipal : null,
      date: form.date,
      note: form.note,
    };
    onSave(existing ? { id: existing.id, ...payload } : payload);
    onClose();
  }

  return (
    <Modal
      title={isEditing ? 'Edit Transaction' : 'Record Transaction'}
      subtitle={`${property.emoji} ${property.address}`}
      onClose={onClose}
      footer={
        <ModalFooter
          onCancel={onClose}
          onConfirm={handleSave}
          confirmLabel={isEditing ? 'Save Changes' : 'Record'}
        />
      }
    >
      <PropertyTxnFormBody
        form={form}
        property={property}
        mortgageBalance={effectiveMortgageBalance}
        fmtNative={fmtNative}
      />
    </Modal>
  );
}
