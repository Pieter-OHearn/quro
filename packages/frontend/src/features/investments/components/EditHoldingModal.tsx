import { useState } from 'react';
import { Check, Trash2 } from 'lucide-react';
import { CURRENCY_LIST, type CurrencyCode } from '@/lib/CurrencyContext';
import { Modal, ModalFooter, FormField, SelectInput, TextInput } from '@/components/ui';
import type { Holding } from '@quro/shared';

type EditHoldingModalProps = {
  existing?: Holding;
  onClose: () => void;
  onSave: (h: Holding, initialBuy?: { shares: number; price: number; date: string }) => void;
  onDelete?: (id: number) => void;
};

type HoldingForm = {
  name: string;
  ticker: string;
  currency: CurrencyCode;
  sector: string;
  currentPrice: string;
  initShares: string;
  initPrice: string;
  initDate: string;
};

function validateBaseFields(form: Readonly<HoldingForm>): Record<string, string> {
  const errs: Record<string, string> = {};
  if (!form.name.trim()) errs.name = 'Required';
  if (!form.ticker.trim()) errs.ticker = 'Required';
  if (!form.currentPrice || isNaN(parseFloat(form.currentPrice))) errs.currentPrice = 'Required';
  return errs;
}

function validateInitialBuy(form: Readonly<HoldingForm>): Record<string, string> {
  const errs: Record<string, string> = {};
  const shares = parseFloat(form.initShares);
  const price = parseFloat(form.initPrice);
  if (!form.initShares || isNaN(shares) || shares <= 0) errs.initShares = 'Required';
  if (!form.initPrice || isNaN(price) || price <= 0) errs.initPrice = 'Required';
  return errs;
}

function validateHoldingForm(
  form: Readonly<HoldingForm>,
  existing: Holding | undefined,
): Record<string, string> {
  const errs = validateBaseFields(form);
  if (!existing) {
    Object.assign(errs, validateInitialBuy(form));
  }
  return errs;
}

type InitialBuySectionProps = {
  form: HoldingForm;
  errors: Record<string, string>;
  currency: CurrencyCode;
  onChange: (field: string, value: string) => void;
};

function InitialBuySection({ form, errors, currency, onChange }: InitialBuySectionProps) {
  return (
    <div className="border-t border-dashed border-slate-200 pt-4">
      <p className="text-xs font-semibold text-slate-600 mb-3">Initial Buy Transaction</p>
      <div className="grid grid-cols-3 gap-3">
        <FormField label="Shares" required error={errors.initShares}>
          <TextInput
            type="number"
            step="0.0001"
            value={form.initShares}
            onChange={(value) => onChange('initShares', value)}
            error={Boolean(errors.initShares)}
            placeholder="50"
          />
        </FormField>
        <FormField label="Buy Price" required error={errors.initPrice}>
          <TextInput
            type="number"
            step="0.01"
            value={form.initPrice}
            onChange={(value) => onChange('initPrice', value)}
            error={Boolean(errors.initPrice)}
            placeholder="98.20"
          />
        </FormField>
        <FormField label="Date">
          <input
            type="date"
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
            value={form.initDate}
            onChange={(event) => onChange('initDate', event.target.value)}
          />
        </FormField>
      </div>

      {form.initShares && form.initPrice && (
        <div className="mt-3 bg-emerald-50 border border-emerald-100 rounded-xl p-3 flex items-center gap-2">
          <Check size={13} className="text-emerald-600" />
          <span className="text-xs text-emerald-700">
            Initial position: {form.initShares} shares @ {currency} {form.initPrice} = {currency}{' '}
            {(parseFloat(form.initShares) * parseFloat(form.initPrice)).toFixed(2)}
          </span>
        </div>
      )}
    </div>
  );
}

type HoldingBaseFieldsProps = {
  form: HoldingForm;
  errors: Record<string, string>;
  onChange: (field: string, value: string) => void;
};

function HoldingBaseFields({ form, errors, onChange }: HoldingBaseFieldsProps) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <FormField label="Security Name" required error={errors.name} className="col-span-2">
        <TextInput
          value={form.name}
          onChange={(value) => onChange('name', value)}
          error={Boolean(errors.name)}
          placeholder="e.g. Vanguard FTSE All-World"
        />
      </FormField>
      <FormField label="Ticker" required error={errors.ticker}>
        <TextInput
          value={form.ticker}
          onChange={(value) => onChange('ticker', value)}
          error={Boolean(errors.ticker)}
          placeholder="VWCE"
        />
      </FormField>
      <FormField label="Sector">
        <TextInput
          value={form.sector}
          onChange={(value) => onChange('sector', value)}
          placeholder="ETF, Tech, Finance..."
        />
      </FormField>
      <FormField label="Currency">
        <SelectInput
          value={form.currency}
          onChange={(value) => onChange('currency', value)}
          options={CURRENCY_LIST}
        />
      </FormField>
      <FormField label="Current Price" required error={errors.currentPrice}>
        <TextInput
          type="number"
          step="0.01"
          value={form.currentPrice}
          onChange={(value) => onChange('currentPrice', value)}
          error={Boolean(errors.currentPrice)}
          placeholder="112.50"
        />
      </FormField>
    </div>
  );
}

function buildHolding(form: HoldingForm, existing: Holding | undefined): Holding {
  return {
    id: existing?.id ?? Date.now(),
    name: form.name.trim(),
    ticker: form.ticker.trim().toUpperCase(),
    currentPrice: parseFloat(form.currentPrice),
    currency: form.currency,
    sector: form.sector || 'Other',
  };
}

function buildInitialForm(existing: Holding | undefined): HoldingForm {
  const today = new Date().toISOString().slice(0, 10);
  if (!existing) {
    return { name: '', ticker: '', currency: 'EUR' as CurrencyCode, sector: 'ETF', currentPrice: '', initShares: '', initPrice: '', initDate: today };
  }
  return {
    name: existing.name,
    ticker: existing.ticker,
    currency: existing.currency as CurrencyCode,
    sector: existing.sector,
    currentPrice: existing.currentPrice.toString(),
    initShares: '',
    initPrice: '',
    initDate: today,
  };
}

function buildDeleteButton(
  existing: Holding | undefined,
  onDelete: ((id: number) => void) | undefined,
  onClose: () => void,
): React.ReactNode {
  if (!existing || !onDelete) return undefined;
  return (
    <button
      onClick={() => {
        onDelete(existing.id);
        onClose();
      }}
      className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl border border-rose-200 text-rose-500 hover:bg-rose-50 text-sm transition-colors"
      title="Delete holding"
    >
      <Trash2 size={14} />
    </button>
  );
}

export function EditHoldingModal({ existing, onClose, onSave, onDelete }: EditHoldingModalProps) {
  const [form, setForm] = useState<HoldingForm>(() => buildInitialForm(existing));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const isNew = !existing;
  const modalTitle = isNew ? 'Add Holding' : 'Edit Holding';
  const modalSubtitle = isNew ? 'Add a stock, ETF or fund' : 'Update details';
  const confirmLabel = isNew ? 'Add Holding' : 'Save Changes';

  function set(field: string, value: string): void {
    setForm((previous) => ({ ...previous, [field]: value }));
    setErrors((previous) => ({ ...previous, [field]: '' }));
  }

  function handleSave() {
    const errs = validateHoldingForm(form, existing);
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }
    const initialBuy = isNew
      ? { shares: parseFloat(form.initShares), price: parseFloat(form.initPrice), date: form.initDate }
      : undefined;
    onSave(buildHolding(form, existing), initialBuy);
    onClose();
  }

  return (
    <Modal
      title={modalTitle}
      subtitle={modalSubtitle}
      onClose={onClose}
      footer={
        <ModalFooter
          onCancel={onClose}
          onConfirm={handleSave}
          confirmLabel={confirmLabel}
          danger={buildDeleteButton(existing, onDelete, onClose)}
        />
      }
    >
      <HoldingBaseFields form={form} errors={errors} onChange={set} />
      {isNew && (
        <InitialBuySection form={form} errors={errors} currency={form.currency} onChange={set} />
      )}
    </Modal>
  );
}
