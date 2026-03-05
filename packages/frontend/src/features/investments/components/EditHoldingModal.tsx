import { useState } from 'react';
import { Check, Loader2, Search, Trash2 } from 'lucide-react';
import { CURRENCY_CODES, type CurrencyCode } from '@/lib/CurrencyContext';
import { Modal, ModalFooter, FormField, SelectInput, TextInput } from '@/components/ui';
import {
  ITEM_TYPE_LABELS,
  TICKER_ITEM_TYPES,
  type Holding,
  type TickerItemType,
  type TickerLookupResult,
} from '@quro/shared';
import { useTickerLookup } from '../hooks/useTickerLookup';

type EditHoldingModalProps = {
  existing?: Holding;
  onClose: () => void;
  onSave: (
    h: Holding,
    initialBuy?: { shares: number; price: number; date: string },
    lookupSnapshot?: {
      priceCurrency?: string | null;
      eodDate?: string | null;
      priceUpdatedAt?: string | null;
    },
  ) => void;
  onDelete?: (id: number) => void;
};

type HoldingForm = {
  name: string;
  ticker: string;
  currency: CurrencyCode;
  sector: string;
  currentPrice: string;
  itemType: TickerItemType | '';
  exchangeMic: string;
  industry: string;
  priceUpdatedAt: string;
  lookupPriceCurrency: string;
  lookupEodDate: string;
  initShares: string;
  initPrice: string;
  initDate: string;
};

const ITEM_TYPE_OPTIONS = [
  { value: '', label: 'Select type' },
  ...TICKER_ITEM_TYPES.map((value) => ({ value, label: ITEM_TYPE_LABELS[value] })),
];
const CURRENCY_SET = new Set<CurrencyCode>(CURRENCY_CODES);
const CURRENCY_ALIASES: Partial<Record<string, CurrencyCode>> = {
  GBX: 'GBP',
};

function toSupportedCurrency(value: string | null | undefined): CurrencyCode | null {
  if (!value) return null;
  const normalized = value.trim().toUpperCase();
  const canonical = CURRENCY_ALIASES[normalized] ?? normalized;
  return CURRENCY_SET.has(canonical as CurrencyCode) ? (canonical as CurrencyCode) : null;
}

function pickNonEmpty(preferred: string | null | undefined, fallback: string): string {
  if (!preferred) return fallback;
  if (!preferred.trim()) return fallback;
  return preferred;
}

function pickItemType(
  preferred: TickerItemType | null | undefined,
  fallback: TickerItemType | '',
): TickerItemType | '' {
  if (!preferred) return fallback;
  return preferred;
}

function pickLookupPrice(result: TickerLookupResult, fallback: string): string {
  if (typeof result.currentPrice !== 'number') return fallback;
  if (!Number.isFinite(result.currentPrice)) return fallback;
  return normalizeDecimalInput(result.currentPrice.toString());
}

function pickLookupCurrency(result: TickerLookupResult, fallback: CurrencyCode): CurrencyCode {
  const lookupCurrency = toSupportedCurrency(result.currency);
  if (!lookupCurrency) return fallback;
  return lookupCurrency;
}

function normalizeDecimalInput(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';

  const compact = trimmed.replace(/\s+/g, '');
  const hasComma = compact.includes(',');
  const hasDot = compact.includes('.');

  if (hasComma && hasDot) {
    return compact.lastIndexOf(',') > compact.lastIndexOf('.')
      ? compact.replaceAll('.', '').replace(',', '.')
      : compact.replaceAll(',', '');
  }
  if (hasComma) return compact.replace(',', '.');
  return compact;
}

function toNormalizedNumber(raw: string): number | null {
  const normalized = normalizeDecimalInput(raw);
  if (!normalized) return null;
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function validateBaseFields(form: Readonly<HoldingForm>): Record<string, string> {
  const errs: Record<string, string> = {};
  if (!form.name.trim()) errs.name = 'Required';
  if (!form.ticker.trim()) errs.ticker = 'Required';
  if (toNormalizedNumber(form.currentPrice) === null) errs.currentPrice = 'Required';
  return errs;
}

function validateInitialBuy(form: Readonly<HoldingForm>): Record<string, string> {
  const errs: Record<string, string> = {};
  const shares = toNormalizedNumber(form.initShares);
  const price = toNormalizedNumber(form.initPrice);
  if (!form.initShares || shares === null || shares <= 0) errs.initShares = 'Required';
  if (!form.initPrice || price === null || price <= 0) errs.initPrice = 'Required';
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

function applyLookupToForm(result: TickerLookupResult, prev: HoldingForm): HoldingForm {
  return {
    ...prev,
    name: pickNonEmpty(result.name, prev.name),
    ticker: pickNonEmpty(result.symbol, prev.ticker),
    currency: pickLookupCurrency(result, prev.currency),
    currentPrice: pickLookupPrice(result, prev.currentPrice),
    sector: pickNonEmpty(result.sector, prev.sector),
    industry: result.industry ?? '',
    priceUpdatedAt: result.priceUpdatedAt ?? prev.priceUpdatedAt,
    lookupPriceCurrency: result.priceCurrency ?? result.currency ?? prev.lookupPriceCurrency,
    lookupEodDate: result.eodDate ?? prev.lookupEodDate,
    itemType: pickItemType(result.itemType, prev.itemType),
    exchangeMic: result.exchange?.mic ?? prev.exchangeMic,
  };
}

type TickerSearchProps = {
  searchTicker: string;
  onSearchTickerChange: (value: string) => void;
  onFind: () => void;
  isLoading: boolean;
  error: string | null;
  foundName: string | null;
};

function TickerSearch({
  searchTicker,
  onSearchTickerChange,
  onFind,
  isLoading,
  error,
  foundName,
}: TickerSearchProps) {
  return (
    <div className="mb-4">
      <p className="text-xs font-semibold text-slate-600 mb-2">Lookup Ticker</p>
      <div className="flex gap-2">
        <input
          type="text"
          value={searchTicker}
          onChange={(e) => onSearchTickerChange(e.target.value.toUpperCase())}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              onFind();
            }
          }}
          placeholder="e.g. NDQ.AX, AAPL"
          className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
        />
        <button
          onClick={onFind}
          disabled={isLoading || !searchTicker.trim()}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white text-sm font-medium transition-colors"
        >
          {isLoading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
          Find
        </button>
      </div>
      {error && <p className="text-xs text-rose-500 mt-1.5">{error}</p>}
      {foundName && (
        <div className="mt-2 bg-emerald-50 border border-emerald-100 rounded-xl p-2.5 flex items-center gap-2">
          <Check size={13} className="text-emerald-600 flex-shrink-0" />
          <span className="text-xs text-emerald-700">Found: {foundName}</span>
        </div>
      )}
    </div>
  );
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
            type="text"
            inputMode="decimal"
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
            {(
              (toNormalizedNumber(form.initShares) ?? 0) * (toNormalizedNumber(form.initPrice) ?? 0)
            ).toFixed(2)}
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
      <FormField label="Currency">
        <SelectInput
          value={form.currency}
          onChange={(value) => onChange('currency', value)}
          options={[...CURRENCY_CODES]}
        />
      </FormField>
      <FormField label="Current Price" required error={errors.currentPrice}>
        <TextInput
          type="text"
          inputMode="decimal"
          value={form.currentPrice}
          onChange={(value) => onChange('currentPrice', value)}
          error={Boolean(errors.currentPrice)}
          placeholder="112.50"
        />
      </FormField>
      <FormField label="Item Type">
        <SelectInput
          value={form.itemType}
          onChange={(value) => onChange('itemType', value)}
          options={ITEM_TYPE_OPTIONS}
        />
      </FormField>
    </div>
  );
}

function buildHolding(form: HoldingForm, existing: Holding | undefined): Holding {
  const fallbackSector =
    form.sector.trim() || (form.itemType ? ITEM_TYPE_LABELS[form.itemType] : 'Unknown');
  return {
    id: existing?.id ?? Date.now(),
    name: form.name.trim(),
    ticker: form.ticker.trim().toUpperCase(),
    currentPrice: toNormalizedNumber(form.currentPrice) ?? 0,
    currency: form.currency,
    sector: fallbackSector,
    itemType: form.itemType || null,
    exchangeMic: form.exchangeMic || null,
    industry: form.industry || null,
    priceUpdatedAt: form.priceUpdatedAt || null,
  };
}

function buildInitialForm(existing: Holding | undefined): HoldingForm {
  const today = new Date().toISOString().slice(0, 10);
  if (!existing) {
    return {
      name: '',
      ticker: '',
      currency: 'EUR' as CurrencyCode,
      sector: '',
      currentPrice: '',
      itemType: '',
      exchangeMic: '',
      industry: '',
      priceUpdatedAt: '',
      lookupPriceCurrency: '',
      lookupEodDate: '',
      initShares: '',
      initPrice: '',
      initDate: today,
    };
  }
  return {
    name: existing.name,
    ticker: existing.ticker,
    currency: existing.currency as CurrencyCode,
    sector: existing.sector,
    currentPrice: existing.currentPrice.toString(),
    itemType: existing.itemType ?? '',
    exchangeMic: existing.exchangeMic ?? '',
    industry: existing.industry ?? '',
    priceUpdatedAt: existing.priceUpdatedAt ?? '',
    lookupPriceCurrency: '',
    lookupEodDate: '',
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

function useHoldingFormState(existing: Holding | undefined) {
  const [form, setForm] = useState<HoldingForm>(() => buildInitialForm(existing));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [searchTicker, setSearchTicker] = useState(existing?.ticker ?? '');
  const tickerLookup = useTickerLookup();

  function set(field: string, value: string): void {
    const normalizedValue =
      field === 'currentPrice' || field === 'initPrice' || field === 'initShares'
        ? normalizeDecimalInput(value)
        : value;
    setForm((previous) => ({ ...previous, [field]: normalizedValue }));
    setErrors((previous) => ({ ...previous, [field]: '' }));
  }

  async function handleFind() {
    if (!searchTicker.trim()) return;
    const result = await tickerLookup.lookup(searchTicker);
    if (result) {
      setForm((prev) => applyLookupToForm(result, prev));
    }
  }

  return { form, errors, setErrors, searchTicker, setSearchTicker, tickerLookup, set, handleFind };
}

export function EditHoldingModal({ existing, onClose, onSave, onDelete }: EditHoldingModalProps) {
  const { form, errors, setErrors, searchTicker, setSearchTicker, tickerLookup, set, handleFind } =
    useHoldingFormState(existing);
  const isNew = !existing;

  function handleSave() {
    const errs = validateHoldingForm(form, existing);
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }
    const initialBuy = isNew
      ? {
          shares: toNormalizedNumber(form.initShares) ?? 0,
          price: toNormalizedNumber(form.initPrice) ?? 0,
          date: form.initDate,
        }
      : undefined;
    const lookupSnapshot = isNew
      ? {
          priceCurrency: form.lookupPriceCurrency || null,
          eodDate: form.lookupEodDate || null,
          priceUpdatedAt: form.priceUpdatedAt || null,
        }
      : undefined;
    onSave(buildHolding(form, existing), initialBuy, lookupSnapshot);
    onClose();
  }

  return (
    <Modal
      title={isNew ? 'Add Holding' : 'Edit Holding'}
      subtitle={isNew ? 'Add a stock, ETF or fund' : 'Update details'}
      onClose={onClose}
      footer={
        <ModalFooter
          onCancel={onClose}
          onConfirm={handleSave}
          confirmLabel={isNew ? 'Add Holding' : 'Save Changes'}
          danger={buildDeleteButton(existing, onDelete, onClose)}
        />
      }
    >
      {isNew && (
        <TickerSearch
          searchTicker={searchTicker}
          onSearchTickerChange={setSearchTicker}
          onFind={() => void handleFind()}
          isLoading={tickerLookup.isLoading}
          error={tickerLookup.error}
          foundName={tickerLookup.data?.name ?? null}
        />
      )}
      <HoldingBaseFields form={form} errors={errors} onChange={set} />
      {isNew && (
        <InitialBuySection form={form} errors={errors} currency={form.currency} onChange={set} />
      )}
    </Modal>
  );
}
