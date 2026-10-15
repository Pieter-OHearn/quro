import { useState } from 'react';
import { Check, Search, Trash2 } from 'lucide-react';
import { CURRENCY_CODES, type CurrencyCode } from '@/lib/CurrencyContext';
import {
  ArchiveOrDeleteDialog,
  Button,
  Modal,
  ModalFooter,
  FormField,
  SelectInput,
  TextInput,
  IconButton,
  DateInput,
} from '@/components/ui';
import {
  ITEM_TYPE_LABELS,
  TICKER_ITEM_TYPES,
  type Holding,
  type TickerItemType,
  type TickerLookupResult,
  todayIsoDate,
} from '@quro/shared';
import { PreviewPanel, PreviewRow } from '@/components/finance/PreviewPanel';
import { useTickerLookup } from '../hooks/useTickerLookup';
import type { DeleteHoldingMode } from '../hooks/mutations';

type EditHoldingModalProps = {
  existing?: Holding;
  /** Current native-currency value of the holding (shares × price), if known. */
  currentValue?: number | null;
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
  onDelete?: (id: number, mode: DeleteHoldingMode) => void;
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
  manualPrice: string;
  excludeFromSync: boolean;
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
    <FormField label="Look up ticker">
      <div className="flex gap-2">
        <TextInput
          value={searchTicker}
          onChange={(value) => onSearchTickerChange(value.toUpperCase())}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !isLoading) {
              e.preventDefault();
              onFind();
            }
          }}
          placeholder="e.g. NDQ.AX, AAPL"
          className="flex-1 min-w-0"
        />
        <Button
          variant="secondary"
          onClick={onFind}
          disabled={!searchTicker.trim()}
          loading={isLoading}
          leadingIcon={<Search size={14} aria-hidden />}
          className="shrink-0"
        >
          Find
        </Button>
      </div>
      {error && (
        <p role="alert" className="mt-1 text-caption text-danger">
          {error}
        </p>
      )}
      {foundName && (
        <p className="mt-1 flex items-center gap-1.5 text-caption text-success">
          <Check size={12} className="shrink-0" aria-hidden />
          Found: {foundName}
        </p>
      )}
    </FormField>
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
    <div className="border-t border-border-subtle pt-4">
      <p className="mb-3 text-title-section text-fg">Initial buy transaction</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
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
        <FormField label="Buy price" required error={errors.initPrice}>
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
          <DateInput value={form.initDate} onChange={(value) => onChange('initDate', value)} />
        </FormField>
      </div>

      {form.initShares && form.initPrice && (
        <PreviewPanel className="mt-3">
          <PreviewRow label="Initial position">
            {form.initShares} shares @ {currency} {form.initPrice} = {currency}{' '}
            {(
              (toNormalizedNumber(form.initShares) ?? 0) * (toNormalizedNumber(form.initPrice) ?? 0)
            ).toFixed(2)}
          </PreviewRow>
        </PreviewPanel>
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
      <FormField label="Security name" required error={errors.name} className="col-span-2">
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
      <FormField label="Current price" required error={errors.currentPrice}>
        <TextInput
          type="text"
          inputMode="decimal"
          value={form.currentPrice}
          onChange={(value) => onChange('currentPrice', value)}
          error={Boolean(errors.currentPrice)}
          placeholder="112.50"
        />
      </FormField>
      <FormField label="Item type">
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
    manualPrice: toNormalizedNumber(form.manualPrice),
    excludeFromSync: form.excludeFromSync,
  };
}

function buildInitialForm(existing: Holding | undefined): HoldingForm {
  const today = todayIsoDate();
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
      manualPrice: '',
      excludeFromSync: false,
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
    manualPrice: existing.manualPrice != null ? existing.manualPrice.toString() : '',
    excludeFromSync: existing.excludeFromSync ?? false,
    initShares: '',
    initPrice: '',
    initDate: today,
  };
}

function buildDeleteButton(
  existing: Holding | undefined,
  onDelete: ((id: number, mode: DeleteHoldingMode) => void) | undefined,
  onRequestConfirm: () => void,
): React.ReactNode {
  if (!existing || !onDelete) return undefined;
  return (
    <IconButton
      icon={Trash2}
      label="Remove holding"
      variant="danger"
      size="lg"
      onClick={onRequestConfirm}
    />
  );
}

function useHoldingFormState(existing: Holding | undefined) {
  const [form, setForm] = useState<HoldingForm>(() => buildInitialForm(existing));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [searchTicker, setSearchTicker] = useState(existing?.ticker ?? '');
  const tickerLookup = useTickerLookup();

  function set(field: string, value: string): void {
    const normalizedValue =
      field === 'currentPrice' ||
      field === 'initPrice' ||
      field === 'initShares' ||
      field === 'manualPrice'
        ? normalizeDecimalInput(value)
        : value;
    setForm((previous) => ({ ...previous, [field]: normalizedValue }));
    setErrors((previous) => ({ ...previous, [field]: '' }));
  }

  function setExcludeFromSync(value: boolean): void {
    setForm((previous) => ({ ...previous, excludeFromSync: value }));
  }

  async function handleFind() {
    if (!searchTicker.trim()) return;
    const result = await tickerLookup.lookup(searchTicker);
    if (result) {
      setForm((prev) => applyLookupToForm(result, prev));
    }
  }

  return {
    form,
    errors,
    setErrors,
    searchTicker,
    setSearchTicker,
    tickerLookup,
    set,
    setExcludeFromSync,
    handleFind,
  };
}

type PriceControlsSectionProps = {
  form: HoldingForm;
  onChange: (field: string, value: string) => void;
  onToggleExcludeFromSync: (value: boolean) => void;
};

function PriceControlsSection({
  form,
  onChange,
  onToggleExcludeFromSync,
}: PriceControlsSectionProps) {
  return (
    <div className="border-t border-border-subtle pt-4">
      <p className="mb-3 text-title-section text-fg">Price controls</p>
      <FormField label="Manual price" hint="Overrides the synced price when set">
        <TextInput
          type="text"
          inputMode="decimal"
          value={form.manualPrice}
          onChange={(value) => onChange('manualPrice', value)}
          placeholder="Leave blank to use synced price"
        />
      </FormField>
      <label className="mt-3 flex min-h-8 cursor-pointer select-none items-center gap-2 max-sm:min-h-11">
        <input
          type="checkbox"
          checked={form.excludeFromSync}
          onChange={(e) => onToggleExcludeFromSync(e.target.checked)}
          className="h-4 w-4 rounded-sm border-border-control focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus-ring"
        />
        <span className="text-cell text-fg">Exclude from price sync</span>
      </label>
    </div>
  );
}

function HoldingDeleteDialog({
  existing,
  currentValue,
  onDelete,
  onCancel,
  onClose,
}: Readonly<{
  existing: Holding;
  currentValue: number | null | undefined;
  onDelete: (id: number, mode: DeleteHoldingMode) => void;
  onCancel: () => void;
  onClose: () => void;
}>) {
  return (
    <ArchiveOrDeleteDialog
      entityLabel="Holding"
      entityName={existing.name}
      balance={currentValue ?? null}
      balanceCurrency={existing.currency}
      balanceLabel="value"
      childrenLabel="buy and sell history"
      onArchive={() => {
        onDelete(existing.id, 'preserveTransactions');
        onCancel();
        onClose();
      }}
      onDelete={() => {
        onDelete(existing.id, 'deleteTransactions');
        onCancel();
        onClose();
      }}
      onCancel={onCancel}
    />
  );
}

function HoldingModalBody({
  isNew,
  form,
  errors,
  searchTicker,
  onSearchTickerChange,
  onFind,
  tickerLookup,
  set,
  onToggleExcludeFromSync,
}: Readonly<{
  isNew: boolean;
  form: HoldingForm;
  errors: Record<string, string>;
  searchTicker: string;
  onSearchTickerChange: (value: string) => void;
  onFind: () => void;
  tickerLookup: ReturnType<typeof useTickerLookup>;
  set: (field: string, value: string) => void;
  onToggleExcludeFromSync: (value: boolean) => void;
}>) {
  return (
    <>
      {isNew && (
        <TickerSearch
          searchTicker={searchTicker}
          onSearchTickerChange={onSearchTickerChange}
          onFind={onFind}
          isLoading={tickerLookup.isLoading}
          error={tickerLookup.error}
          foundName={tickerLookup.data?.name ?? null}
        />
      )}
      <HoldingBaseFields form={form} errors={errors} onChange={set} />
      <PriceControlsSection
        form={form}
        onChange={set}
        onToggleExcludeFromSync={onToggleExcludeFromSync}
      />
      {isNew && (
        <InitialBuySection form={form} errors={errors} currency={form.currency} onChange={set} />
      )}
    </>
  );
}

function buildHoldingSavePayload(form: HoldingForm, existing: Holding | undefined) {
  const isNew = !existing;
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
  return { initialBuy, lookupSnapshot };
}

export function EditHoldingModal({
  existing,
  currentValue,
  onClose,
  onSave,
  onDelete,
}: EditHoldingModalProps) {
  const {
    form,
    errors,
    setErrors,
    searchTicker,
    setSearchTicker,
    tickerLookup,
    set,
    setExcludeFromSync,
    handleFind,
  } = useHoldingFormState(existing);
  const isNew = !existing;
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  function handleSave() {
    const errs = validateHoldingForm(form, existing);
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }
    const { initialBuy, lookupSnapshot } = buildHoldingSavePayload(form, existing);
    onSave(buildHolding(form, existing), initialBuy, lookupSnapshot);
    onClose();
  }

  return (
    <Modal
      title={isNew ? 'Add holding' : 'Edit holding'}
      subtitle={isNew ? 'Add a stock, ETF or fund' : 'Update details'}
      onClose={onClose}
      footer={
        <ModalFooter
          onCancel={onClose}
          onConfirm={handleSave}
          confirmLabel={isNew ? 'Add holding' : 'Save changes'}
          danger={buildDeleteButton(existing, onDelete, () => setConfirmingDelete(true))}
        />
      }
    >
      <HoldingModalBody
        isNew={isNew}
        form={form}
        errors={errors}
        searchTicker={searchTicker}
        onSearchTickerChange={setSearchTicker}
        onFind={() => void handleFind()}
        tickerLookup={tickerLookup}
        set={set}
        onToggleExcludeFromSync={setExcludeFromSync}
      />
      {confirmingDelete && existing && onDelete ? (
        <HoldingDeleteDialog
          existing={existing}
          currentValue={currentValue}
          onDelete={onDelete}
          onCancel={() => setConfirmingDelete(false)}
          onClose={onClose}
        />
      ) : null}
    </Modal>
  );
}
