import { useState } from 'react';
import { CURRENCY_LIST, type CurrencyCode, useCurrency } from '@/lib/CurrencyContext';
import { Modal, ModalFooter, FormField, SelectInput, TextInput } from '@/components/ui';
import type { Property } from '@quro/shared';

const PROPERTY_TYPES = [
  'Buy-to-Let',
  'Primary Residence',
  'Investment',
  'Holiday Home',
  'Commercial',
] as const;

type AddPropertyModalProps = {
  onClose: () => void;
  onSave: (p: Omit<Property, 'id'>) => void;
};

type PropertyEquityPreviewProps = {
  equity: number;
  appreciation: number;
  currency: CurrencyCode;
  purchasePrice: number;
  fmtNative: (value: number, currency: string, compact?: boolean) => string;
};

function PropertyEquityPreview({
  equity,
  appreciation,
  currency,
  purchasePrice,
  fmtNative,
}: PropertyEquityPreviewProps) {
  return (
    <div className="bg-slate-50 rounded-xl p-3 space-y-1.5">
      <div className="flex justify-between text-xs">
        <span className="text-slate-500">Equity</span>
        <span className={`font-semibold ${equity >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
          {fmtNative(equity, currency, true)}
        </span>
      </div>
      {purchasePrice > 0 && (
        <div className="flex justify-between text-xs">
          <span className="text-slate-500">Appreciation</span>
          <span
            className={`font-semibold ${appreciation >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}
          >
            {appreciation >= 0 ? '+' : ''}
            {fmtNative(appreciation, currency, true)}
          </span>
        </div>
      )}
    </div>
  );
}

type PropertyFormState = {
  emoji: string;
  address: string;
  propertyType: string;
  currency: CurrencyCode;
  purchasePrice: string;
  currentValue: string;
  monthlyRent: string;
};

type PropertyFormFieldsProps = {
  form: PropertyFormState;
  errors: Record<string, string>;
  onSet: (field: string, value: string) => void;
};

function PropertyIdentityFields({ form, errors, onSet }: PropertyFormFieldsProps) {
  return (
    <>
      <div className="flex gap-3">
        <FormField label="Icon" className="w-20 flex-shrink-0">
          <TextInput
            value={form.emoji}
            onChange={(value) => onSet('emoji', value)}
            className="text-center text-lg"
            maxLength={2}
          />
        </FormField>
        <FormField label="Address" required error={errors.address} className="flex-1">
          <TextInput
            value={form.address}
            onChange={(value) => onSet('address', value)}
            error={Boolean(errors.address)}
            placeholder="e.g. Keizersgracht 12, Amsterdam"
          />
        </FormField>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <FormField label="Property Type">
          <SelectInput
            value={form.propertyType}
            onChange={(value) => onSet('propertyType', value)}
            options={Array.from(PROPERTY_TYPES)}
          />
        </FormField>
        <FormField label="Currency">
          <SelectInput
            value={form.currency}
            onChange={(value) => onSet('currency', value)}
            options={CURRENCY_LIST}
          />
        </FormField>
      </div>
    </>
  );
}

function PropertyValueFields({ form, errors, onSet }: PropertyFormFieldsProps) {
  return (
    <>
      <div className="grid grid-cols-2 gap-4">
        <FormField label="Purchase Price" required error={errors.purchasePrice}>
          <TextInput
            type="number"
            value={form.purchasePrice}
            onChange={(value) => onSet('purchasePrice', value)}
            error={Boolean(errors.purchasePrice)}
            placeholder="0"
          />
        </FormField>
        <FormField label="Current Value" required error={errors.currentValue}>
          <TextInput
            type="number"
            value={form.currentValue}
            onChange={(value) => onSet('currentValue', value)}
            error={Boolean(errors.currentValue)}
            placeholder="0"
          />
        </FormField>
      </div>
      <FormField label="Monthly Rent">
        <TextInput
          type="number"
          value={form.monthlyRent}
          onChange={(value) => onSet('monthlyRent', value)}
          placeholder="0"
        />
      </FormField>
    </>
  );
}

function PropertyFormFields({ form, errors, onSet }: PropertyFormFieldsProps) {
  return (
    <>
      <PropertyIdentityFields form={form} errors={errors} onSet={onSet} />
      <PropertyValueFields form={form} errors={errors} onSet={onSet} />
    </>
  );
}

function validatePropertyForm(
  form: PropertyFormState,
  parsed: { purchasePrice: number; currentValue: number },
): Record<string, string> {
  const errs: Record<string, string> = {};
  if (!form.address.trim()) errs.address = 'Required';
  if (!form.purchasePrice || parsed.purchasePrice <= 0) errs.purchasePrice = 'Required';
  if (!form.currentValue || parsed.currentValue <= 0) errs.currentValue = 'Required';
  return errs;
}

function useAddPropertyForm() {
  const [form, setForm] = useState<PropertyFormState>({
    emoji: '🏠',
    address: '',
    propertyType: 'Buy-to-Let',
    currency: 'EUR' as CurrencyCode,
    purchasePrice: '',
    currentValue: '',
    monthlyRent: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  function set(field: string, value: string): void {
    setForm((previous) => ({ ...previous, [field]: value }));
    if (errors[field]) {
      setErrors((previous) => {
        const next = { ...previous };
        delete next[field];
        return next;
      });
    }
  }

  const parsed = {
    purchasePrice: parseFloat(form.purchasePrice) || 0,
    currentValue: parseFloat(form.currentValue) || 0,
    monthlyRent: parseFloat(form.monthlyRent) || 0,
  };

  return { form, errors, set, parsed, setErrors };
}

export function AddPropertyModal({ onClose, onSave }: AddPropertyModalProps) {
  const { fmtNative } = useCurrency();
  const { form, errors, set, parsed, setErrors } = useAddPropertyForm();

  function handleSave() {
    const errs = validatePropertyForm(form, parsed);
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }
    onSave({
      emoji: form.emoji,
      address: form.address.trim(),
      propertyType: form.propertyType,
      currency: form.currency,
      purchasePrice: parsed.purchasePrice,
      currentValue: parsed.currentValue,
      mortgage: 0,
      mortgageId: null,
      monthlyRent: parsed.monthlyRent,
    });
    onClose();
  }

  return (
    <Modal
      title="Add Property"
      subtitle="Track a new property in your portfolio"
      onClose={onClose}
      maxWidth="md"
      scrollable
      footer={<ModalFooter onCancel={onClose} onConfirm={handleSave} confirmLabel="Add Property" />}
    >
      <PropertyFormFields form={form} errors={errors} onSet={set} />
      {parsed.currentValue > 0 && (
        <PropertyEquityPreview
          equity={parsed.currentValue}
          appreciation={parsed.currentValue - parsed.purchasePrice}
          currency={form.currency}
          purchasePrice={parsed.purchasePrice}
          fmtNative={fmtNative}
        />
      )}
    </Modal>
  );
}
