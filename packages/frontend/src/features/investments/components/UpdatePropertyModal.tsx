import { useState } from 'react';
import { useCurrency } from '@/lib/CurrencyContext';
import { Modal, ModalFooter, FormField, TextInput } from '@/components/ui';
import type { Property } from '@quro/shared';

type UpdatePropertyModalProps = {
  property: Property;
  mortgageBalance: number;
  onClose: () => void;
  onSave: (id: number, value: number, rent: number) => void;
};

type PropertyStatsPreviewProps = {
  equity: number;
  appreciation: number;
  appreciationPct: number;
  currency: string;
  fmtNative: (value: number, currency: string, compact?: boolean) => string;
};

function PropertyStatsPreview({
  equity,
  appreciation,
  appreciationPct,
  currency,
  fmtNative,
}: PropertyStatsPreviewProps) {
  return (
    <div className="bg-slate-50 rounded-xl p-3 space-y-1.5">
      <div className="flex justify-between text-xs">
        <span className="text-slate-500">Equity</span>
        <span className={`font-semibold ${equity >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
          {fmtNative(equity, currency)}
        </span>
      </div>
      <div className="flex justify-between text-xs">
        <span className="text-slate-500">Appreciation</span>
        <span
          className={`font-semibold ${appreciation >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}
        >
          {appreciation >= 0 ? '+' : ''}
          {fmtNative(appreciation, currency)} ({appreciationPct >= 0 ? '+' : ''}
          {appreciationPct.toFixed(1)}%)
        </span>
      </div>
    </div>
  );
}

function useUpdatePropertyForm(property: Property) {
  const [value, setValue] = useState(property.currentValue.toString());
  const [rent, setRent] = useState(property.monthlyRent.toString());
  const [errors, setErrors] = useState<Record<string, string>>({});

  const numericValue = parseFloat(value) || 0;
  const equity = numericValue - 0; // mortgage balance is passed in separately
  const appreciation = numericValue - property.purchasePrice;
  const appreciationPct =
    ((numericValue || property.currentValue) / property.purchasePrice - 1) * 100;

  function handleValueChange(next: string) {
    setValue(next);
    setErrors((previous) => ({ ...previous, value: '' }));
  }

  return {
    value,
    rent,
    errors,
    numericValue,
    equity,
    appreciation,
    appreciationPct,
    setRent,
    setErrors,
    handleValueChange,
  };
}

type MortgageBalanceFieldProps = {
  mortgageBalance: number;
  currency: string;
  fmtNative: (value: number, currency: string, compact?: boolean) => string;
};

function MortgageBalanceField({ mortgageBalance, currency, fmtNative }: MortgageBalanceFieldProps) {
  return (
    <FormField label="Linked Mortgage Balance">
      <div className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700">
        {mortgageBalance > 0 ? fmtNative(mortgageBalance, currency) : 'No mortgage linked yet'}
      </div>
      <p className="text-xs text-slate-400 mt-1">
        Manage property-mortgage links in the Mortgage section.
      </p>
    </FormField>
  );
}

export function UpdatePropertyModal({
  property,
  mortgageBalance,
  onClose,
  onSave,
}: UpdatePropertyModalProps) {
  const { fmtNative } = useCurrency();
  const form = useUpdatePropertyForm(property);
  const equity = form.numericValue - mortgageBalance;

  function handleSave() {
    if (!form.value || isNaN(parseFloat(form.value))) {
      form.setErrors({ value: 'Required' });
      return;
    }
    onSave(property.id, form.numericValue, parseFloat(form.rent) || 0);
    onClose();
  }

  return (
    <Modal
      title="Update Property"
      subtitle={property.address}
      onClose={onClose}
      maxWidth="sm"
      footer={<ModalFooter onCancel={onClose} onConfirm={handleSave} confirmLabel="Update" />}
    >
      <FormField label={`Current Value (${property.currency})`} required error={form.errors.value}>
        <TextInput
          type="number"
          value={form.value}
          onChange={form.handleValueChange}
          error={Boolean(form.errors.value)}
        />
        <p className="text-xs text-slate-400 mt-1">
          Previously {fmtNative(property.currentValue, property.currency)}
        </p>
      </FormField>
      <MortgageBalanceField
        mortgageBalance={mortgageBalance}
        currency={property.currency}
        fmtNative={fmtNative}
      />
      <FormField label={`Monthly Rent (${property.currency})`}>
        <TextInput type="number" value={form.rent} onChange={form.setRent} />
      </FormField>
      <PropertyStatsPreview
        equity={equity}
        appreciation={form.appreciation}
        appreciationPct={form.appreciationPct}
        currency={property.currency}
        fmtNative={fmtNative}
      />
    </Modal>
  );
}
