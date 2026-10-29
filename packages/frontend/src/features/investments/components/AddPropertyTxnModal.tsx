import { PROPERTY_TXN_META, PROPERTY_TXN_FORM } from '../constants';
import { useState } from 'react';
import { useCurrency } from '@/lib/CurrencyContext';
import { formatFixedInputValue } from '@/lib/utils';
import {
  Change,
  Modal,
  ModalFooter,
  FormField,
  CurrencyInput,
  TxnTypeSelector,
  DateNoteRow,
} from '@/components/ui';
import { todayIsoDate, type Property, type PropertyTransaction } from '@quro/shared';
import { PreviewPanel, PreviewRow } from '@/components/finance/PreviewPanel';
import { TxnAmount } from '@/components/finance/TxnAmount';
import type { SavePropertyTxnInput } from '../types';
import { isInvestmentProperty, type PropertyTxnType } from '../utils/position';

type AddPropertyTxnModalProps = {
  property: Property;
  existing?: PropertyTransaction;
  onClose: () => void;
  onSave: (t: SavePropertyTxnInput) => void;
};

type PropertyTxnInfoBarProps = {
  type: PropertyTxnType;
  property: Property;
  fmtNative: (value: number, currency: string, compact?: boolean) => string;
};

function infoBarFigure(type: PropertyTxnType, property: Property) {
  if (type === 'valuation') return { label: 'Current value', value: property.currentValue };
  if (type === 'rent_income') return { label: 'Monthly rent target', value: property.monthlyRent };
  return { label: 'Property value', value: property.currentValue };
}

function PropertyTxnInfoBar({ type, property, fmtNative }: PropertyTxnInfoBarProps) {
  const { label, value } = infoBarFigure(type, property);
  return (
    <p className="text-caption text-fg-subtle">
      {label} ·{' '}
      <span className="font-numeric font-medium text-fg">
        {fmtNative(value, property.currency)}
      </span>
    </p>
  );
}

type PropertyTxnPreviewProps = {
  type: PropertyTxnType;
  parsedAmount: number;
  property: Property;
  fmtNative: (value: number, currency: string, compact?: boolean) => string;
};

type PreviewFmt = (value: number, currency: string, compact?: boolean) => string;

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
  return (
    <>
      <PreviewRow label="Previous value">{fmtNative(currentValue, currency, true)}</PreviewRow>
      <PreviewRow label="New value">{fmtNative(parsedAmount, currency, true)}</PreviewRow>
      <PreviewRow label="Change">
        <Change value={parsedAmount - currentValue} format="amount" currency={currency} />
      </PreviewRow>
    </>
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
  const format = (value: number) => fmtNative(value, currency, true);
  if (type === 'rent_income') {
    return (
      <>
        <PreviewRow label="Income booked">
          <TxnAmount value={parsedAmount} format={format} />
        </PreviewRow>
        <PreviewRow label="Vs monthly target">
          <Change value={parsedAmount - monthlyRent} format="amount" currency={currency} />
        </PreviewRow>
      </>
    );
  }
  return (
    <>
      <PreviewRow label="Expense booked">
        <TxnAmount value={-parsedAmount} format={format} />
      </PreviewRow>
      <PreviewRow label="Net vs monthly rent">
        <Change value={monthlyRent - parsedAmount} format="amount" currency={currency} />
      </PreviewRow>
    </>
  );
}

function PropertyTxnPreview({ type, parsedAmount, property, fmtNative }: PropertyTxnPreviewProps) {
  return (
    <PreviewPanel>
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
    </PreviewPanel>
  );
}

function getAmountLabel(type: PropertyTxnType, currency: string) {
  return `${PROPERTY_TXN_FORM[type].amountLabel} (${currency})`;
}

// Repayments are recorded on the mortgage, which owns them.
function getSupportedPropertyTxnTypes(property: Property): PropertyTxnType[] {
  return isInvestmentProperty(property.propertyType)
    ? (['valuation', 'rent_income', 'expense'] as PropertyTxnType[])
    : (['valuation'] as PropertyTxnType[]);
}

function resolveInitialPropertyTxnType(
  transactionTypes: PropertyTxnType[],
  existing: PropertyTransaction | undefined,
): PropertyTxnType {
  const fallbackType = transactionTypes[0] ?? 'valuation';
  const initialType = existing?.type ?? fallbackType;
  return transactionTypes.includes(initialType) ? initialType : fallbackType;
}

function usePropertyTxnForm(property: Property, existing: PropertyTransaction | undefined) {
  const transactionTypes = getSupportedPropertyTxnTypes(property);
  const [type, setType] = useState<PropertyTxnType>(
    resolveInitialPropertyTxnType(transactionTypes, existing),
  );
  const [amount, setAmount] = useState(existing ? formatFixedInputValue(existing.amount) : '');
  const [date, setDate] = useState(existing?.date ?? todayIsoDate());
  const [note, setNote] = useState(existing?.note ?? '');
  const [error, setError] = useState('');

  const parsedAmount = parseFloat(amount) || 0;

  function handleTypeChange(txnType: PropertyTxnType) {
    setType(txnType);
    setError('');
    setAmount('');
  }

  return {
    transactionTypes,
    type,
    amount,
    date,
    note,
    error,
    parsedAmount,
    setAmount,
    setDate,
    setNote,
    setError,
    handleTypeChange,
  };
}

type PropertyTxnFormBodyProps = {
  form: ReturnType<typeof usePropertyTxnForm>;
  property: Property;
  fmtNative: (value: number, currency: string, compact?: boolean) => string;
};

type AmountFieldProps = {
  form: ReturnType<typeof usePropertyTxnForm>;
  property: Property;
};

function AmountField({ form, property }: AmountFieldProps) {
  const { type, amount, error, parsedAmount } = form;
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
      {error && parsedAmount > 0 && (
        <p role="alert" className="text-caption text-danger">
          {error}
        </p>
      )}
    </>
  );
}

function PropertyTxnFormBody({ form, property, fmtNative }: PropertyTxnFormBodyProps) {
  return (
    <>
      <FormField label="Transaction type">
        <TxnTypeSelector<PropertyTxnType>
          types={form.transactionTypes.map((txnType) => PROPERTY_TXN_META[txnType])}
          value={form.type}
          onChange={form.handleTypeChange}
          columns={2}
        />
      </FormField>
      <PropertyTxnInfoBar type={form.type} property={property} fmtNative={fmtNative} />
      <AmountField form={form} property={property} />
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
          property={property}
          fmtNative={fmtNative}
        />
      )}
    </>
  );
}

export function AddPropertyTxnModal({
  property,
  existing,
  onClose,
  onSave,
}: AddPropertyTxnModalProps) {
  const { fmtNative } = useCurrency();
  const form = usePropertyTxnForm(property, existing);
  const isEditing = Boolean(existing);

  function handleSave() {
    if (form.parsedAmount <= 0) {
      form.setError('Enter a valid amount');
      return;
    }
    const payload = {
      propertyId: property.id,
      type: form.type,
      amount: form.parsedAmount,
      date: form.date,
      note: form.note,
    };
    onSave(existing ? { id: existing.id, ...payload } : payload);
    onClose();
  }

  return (
    <Modal
      title={isEditing ? 'Edit transaction' : 'Record transaction'}
      subtitle={`${property.emoji} ${property.address}`}
      onClose={onClose}
      footer={
        <ModalFooter
          onCancel={onClose}
          onConfirm={handleSave}
          confirmLabel={isEditing ? 'Save changes' : 'Record'}
        />
      }
    >
      <PropertyTxnFormBody form={form} property={property} fmtNative={fmtNative} />
    </Modal>
  );
}
