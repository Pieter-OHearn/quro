import { X } from 'lucide-react';
import { CURRENCY_LIST, type CurrencyCode } from '@/lib/CurrencyContext';
import type { Mortgage as MortgageType, Property } from '@quro/shared';
import { useAddMortgageForm } from '../hooks';
import type { MortgageFormPayload, MortgageFormState } from '../types';

export type { MortgageFormPayload } from '../types';

type AddMortgageModalProps = {
  existing?: MortgageType;
  properties: Property[];
  linkedPropertyId: number | null;
  onClose: () => void;
  onSave: (mortgage: MortgageFormPayload) => Promise<void> | void;
};

const RATE_TYPES = ['Fixed', 'Variable', 'Tracker', 'Offset'];
const LOW_LTV_THRESHOLD = 70;
const MEDIUM_LTV_THRESHOLD = 85;

const n = (value: string) => parseFloat(value) || 0;

// ─── Form Section Sub-components ─────────────────────────────────────────────

type FormState = MortgageFormState;
type SetFieldFn = <K extends keyof FormState>(field: K, value: FormState[K]) => void;
type Errors = Record<string, string>;

type PropertySectionProps = { form: FormState; errors: Errors; setField: SetFieldFn };

function LenderCurrencyGrid({ form, errors, setField }: PropertySectionProps) {
  return (
    <div className="grid grid-cols-3 gap-3">
      <div className="col-span-2">
        <label className="block text-xs font-semibold text-slate-600 mb-1.5">
          Lender <span className="text-rose-500">*</span>
        </label>
        <input
          className={`w-full rounded-xl border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 ${errors.lender ? 'border-rose-300 bg-rose-50' : 'border-slate-200 bg-slate-50'}`}
          placeholder="e.g. ABN AMRO"
          value={form.lender}
          onChange={(e) => setField('lender', e.target.value)}
        />
        {errors.lender && <p className="text-xs text-rose-500 mt-1">{errors.lender}</p>}
      </div>
      <div>
        <label className="block text-xs font-semibold text-slate-600 mb-1.5">Currency</label>
        <select
          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
          value={form.currency}
          onChange={(e) => setField('currency', e.target.value as CurrencyCode)}
        >
          {CURRENCY_LIST.map((currency) => (
            <option key={currency} value={currency}>
              {currency}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

function PropertySection({ form, errors, setField }: PropertySectionProps) {
  return (
    <div>
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">
        Property
      </p>
      <div className="space-y-3">
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1.5">
            Property Address <span className="text-rose-500">*</span>
          </label>
          <input
            className={`w-full rounded-xl border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 ${errors.propertyAddress ? 'border-rose-300 bg-rose-50' : 'border-slate-200 bg-slate-50'}`}
            placeholder="e.g. Prinsengracht 42, Amsterdam"
            value={form.propertyAddress}
            onChange={(e) => setField('propertyAddress', e.target.value)}
          />
          {errors.propertyAddress && (
            <p className="text-xs text-rose-500 mt-1">{errors.propertyAddress}</p>
          )}
        </div>
        <LenderCurrencyGrid form={form} errors={errors} setField={setField} />
      </div>
    </div>
  );
}

type PropertyLinkSectionProps = {
  form: FormState;
  errors: Errors;
  setField: SetFieldFn;
  availableProperties: Property[];
  selectedProperty: Property | undefined;
  existing?: MortgageType;
};

function PropertyLinkSection({
  form,
  errors,
  setField,
  availableProperties,
  selectedProperty,
  existing,
}: PropertyLinkSectionProps) {
  return (
    <div>
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">
        Property Link
      </p>
      <select
        className={`w-full rounded-xl border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 ${errors.linkedPropertyId ? 'border-rose-300 bg-rose-50' : 'border-slate-200 bg-slate-50'}`}
        value={form.linkedPropertyId}
        onChange={(e) => setField('linkedPropertyId', e.target.value)}
      >
        <option value="">Select a property</option>
        {availableProperties.map((property) => (
          <option key={property.id} value={property.id.toString()}>
            {property.emoji} {property.address} ({property.currency})
          </option>
        ))}
      </select>
      {errors.linkedPropertyId && (
        <p className="text-xs text-rose-500 mt-1">{errors.linkedPropertyId}</p>
      )}
      <p className="text-[10px] text-slate-400 mt-1.5">
        Add a property first, then link the mortgage here.
      </p>
      {selectedProperty && (
        <p className="text-[10px] text-indigo-600 mt-1">
          Using linked property details: {selectedProperty.address} ({selectedProperty.currency}).
        </p>
      )}
      {availableProperties.length === 0 && !existing && (
        <p className="text-xs text-amber-600 mt-2">
          No unlinked properties available. Add a property in Investments first.
        </p>
      )}
    </div>
  );
}

type LoanFinancialsSectionProps = { form: FormState; errors: Errors; setField: SetFieldFn };

function LoanFinancialsSection({ form, errors, setField }: LoanFinancialsSectionProps) {
  const fields = [
    { field: 'originalAmount', label: 'Original Loan Amount', placeholder: '240000' },
    { field: 'outstandingBalance', label: 'Outstanding Balance', placeholder: '218600' },
    { field: 'propertyValue', label: 'Current Property Value', placeholder: '362000' },
    { field: 'monthlyPayment', label: 'Monthly Payment', placeholder: '1280' },
  ];
  return (
    <div>
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">
        Loan Financials
      </p>
      <div className="grid grid-cols-2 gap-3">
        {fields.map(({ field, label, placeholder }) => (
          <div key={field}>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">
              {label} <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-medium">
                {form.currency}
              </span>
              <input
                type="number"
                className={`w-full rounded-xl border pl-12 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 ${errors[field] ? 'border-rose-300 bg-rose-50' : 'border-slate-200 bg-slate-50'}`}
                placeholder={placeholder}
                value={form[field as keyof MortgageFormState]}
                onChange={(e) => setField(field as keyof MortgageFormState, e.target.value)}
              />
            </div>
            {errors[field] && <p className="text-xs text-rose-500 mt-1">{errors[field]}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}

type RateTermSectionProps = { form: FormState; errors: Errors; setField: SetFieldFn };

function InterestRateField({ form, errors, setField }: RateTermSectionProps) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-600 mb-1.5">
        Interest Rate (%) <span className="text-rose-500">*</span>
      </label>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-medium">
          %
        </span>
        <input
          type="number"
          step="0.01"
          className={`w-full rounded-xl border pl-8 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 ${errors.interestRate ? 'border-rose-300 bg-rose-50' : 'border-slate-200 bg-slate-50'}`}
          placeholder="4.25"
          value={form.interestRate}
          onChange={(e) => setField('interestRate', e.target.value)}
        />
      </div>
      {errors.interestRate && <p className="text-xs text-rose-500 mt-1">{errors.interestRate}</p>}
    </div>
  );
}

function LoanTermField({ form, errors, setField }: RateTermSectionProps) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-600 mb-1.5">
        Loan Term <span className="text-rose-500">*</span>
      </label>
      <div className="relative">
        <input
          type="number"
          className={`w-full rounded-xl border pl-3 pr-14 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 ${errors.termYears ? 'border-rose-300 bg-rose-50' : 'border-slate-200 bg-slate-50'}`}
          placeholder="25"
          value={form.termYears}
          onChange={(e) => setField('termYears', e.target.value)}
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">
          years
        </span>
      </div>
      {errors.termYears && <p className="text-xs text-rose-500 mt-1">{errors.termYears}</p>}
    </div>
  );
}

function OverpaymentLimitField({ form, setField }: { form: FormState; setField: SetFieldFn }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-600 mb-1.5">
        Overpayment Limit (%)
      </label>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-medium">
          %
        </span>
        <input
          type="number"
          className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-8 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
          placeholder="10"
          value={form.overpaymentLimit}
          onChange={(e) => setField('overpaymentLimit', e.target.value)}
        />
      </div>
    </div>
  );
}

function RateTermSection({ form, errors, setField }: RateTermSectionProps) {
  return (
    <div>
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">
        Rate & Term
      </p>
      <div className="grid grid-cols-2 gap-3">
        <InterestRateField form={form} errors={errors} setField={setField} />
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1.5">Rate Type</label>
          <select
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
            value={form.rateType}
            onChange={(e) => setField('rateType', e.target.value)}
          >
            {RATE_TYPES.map((type) => (
              <option key={type}>{type}</option>
            ))}
          </select>
        </div>
        <LoanTermField form={form} errors={errors} setField={setField} />
        <OverpaymentLimitField form={form} setField={setField} />
      </div>
    </div>
  );
}

type DatesSectionProps = { form: FormState; setField: SetFieldFn };

function DatesSection({ form, setField }: DatesSectionProps) {
  return (
    <div>
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Dates</p>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1.5">Start Date</label>
          <input
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
            placeholder="e.g. March 2022"
            value={form.startDate}
            onChange={(e) => setField('startDate', e.target.value)}
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1.5">End Date</label>
          <input
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
            placeholder="e.g. March 2047"
            value={form.endDate}
            onChange={(e) => setField('endDate', e.target.value)}
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1.5">Fixed Until</label>
          <input
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 disabled:opacity-50"
            placeholder={form.rateType === 'Fixed' ? 'e.g. March 2027' : 'N/A'}
            disabled={form.rateType !== 'Fixed'}
            value={form.rateType === 'Fixed' ? form.fixedUntil : ''}
            onChange={(e) => setField('fixedUntil', e.target.value)}
          />
        </div>
      </div>
    </div>
  );
}

function getLtvColor(ltv: number) {
  if (ltv < LOW_LTV_THRESHOLD)
    return { border: 'bg-emerald-50 border-emerald-100', text: 'text-emerald-600' };
  if (ltv < MEDIUM_LTV_THRESHOLD)
    return { border: 'bg-amber-50 border-amber-100', text: 'text-amber-600' };
  return { border: 'bg-rose-50 border-rose-100', text: 'text-rose-500' };
}

type LtvPreviewProps = { ltvPreview: string; form: FormState };

function LtvPreview({ ltvPreview, form }: LtvPreviewProps) {
  const ltvVal = parseFloat(ltvPreview);
  const { border, text } = getLtvColor(ltvVal);
  return (
    <div className={`rounded-xl p-4 border flex items-center justify-between ${border}`}>
      <div>
        <p className="text-xs font-semibold text-slate-700">Loan-to-Value Preview</p>
        <p className="text-xs text-slate-500 mt-0.5">
          {form.currency} {n(form.outstandingBalance).toLocaleString()} on {form.currency}{' '}
          {n(form.propertyValue).toLocaleString()}
        </p>
      </div>
      <div className="text-right">
        <p className={`font-black text-xl ${text}`}>{ltvPreview}%</p>
        <p className="text-[10px] text-slate-400">LTV</p>
      </div>
    </div>
  );
}

type MortgageModalHeaderProps = { existing: MortgageType | undefined; onClose: () => void };
function MortgageModalHeader({ existing, onClose }: MortgageModalHeaderProps) {
  return (
    <div className="bg-gradient-to-r from-[#0a0f1e] to-[#1a1f3e] px-6 py-5 flex items-center justify-between flex-shrink-0">
      <div>
        <h2 className="font-bold text-white">{existing ? 'Edit Mortgage' : 'Add Mortgage'}</h2>
        <p className="text-xs text-indigo-300 mt-0.5">
          {existing ? 'Update mortgage details' : 'Set up a new property mortgage'}
        </p>
      </div>
      <button
        onClick={onClose}
        className="p-2 rounded-xl hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
      >
        <X size={18} />
      </button>
    </div>
  );
}

type MortgageModalFooterProps = {
  saving: boolean;
  existing: MortgageType | undefined;
  disableSave: boolean;
  onSave: () => void;
  onClose: () => void;
};
function MortgageModalFooter({
  saving,
  existing,
  disableSave,
  onSave,
  onClose,
}: MortgageModalFooterProps) {
  return (
    <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex gap-3 flex-shrink-0">
      <button
        onClick={onClose}
        className="flex-1 rounded-xl border border-slate-200 text-slate-600 py-2.5 text-sm hover:bg-slate-100 transition-colors"
      >
        Cancel
      </button>
      <button
        onClick={onSave}
        disabled={disableSave}
        className="flex-1 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white py-2.5 text-sm font-medium transition-colors"
      >
        {saving ? 'Saving...' : existing ? 'Save Changes' : 'Add Mortgage'}
      </button>
    </div>
  );
}

type MortgageFormBodyProps = {
  form: MortgageFormState;
  errors: Record<string, string>;
  setField: (f: string, v: string) => void;
  availableProperties: Property[];
  selectedProperty: Property | undefined;
  existing: MortgageType | undefined;
  ltvPreview: string | null;
};

function MortgageFormBody({
  form,
  errors,
  setField,
  availableProperties,
  selectedProperty,
  existing,
  ltvPreview,
}: MortgageFormBodyProps) {
  return (
    <div className="p-6 space-y-5 overflow-y-auto">
      <PropertySection form={form} errors={errors} setField={setField} />
      <PropertyLinkSection
        form={form}
        errors={errors}
        setField={setField}
        availableProperties={availableProperties}
        selectedProperty={selectedProperty}
        existing={existing}
      />
      <LoanFinancialsSection form={form} errors={errors} setField={setField} />
      <RateTermSection form={form} errors={errors} setField={setField} />
      <DatesSection form={form} setField={setField} />
      {ltvPreview && <LtvPreview ltvPreview={ltvPreview} form={form} />}
    </div>
  );
}

export function AddMortgageModal(props: AddMortgageModalProps) {
  const { existing, properties, linkedPropertyId, onClose, onSave } = props;
  const { form, errors, saving, setField, handleSave } = useAddMortgageForm({
    existing,
    properties,
    linkedPropertyId,
    onClose,
    onSave,
  });
  const linkedPropertyIdNum = form.linkedPropertyId
    ? Number.parseInt(form.linkedPropertyId, 10)
    : NaN;
  const selectedProperty = Number.isInteger(linkedPropertyIdNum)
    ? properties.find((p) => p.id === linkedPropertyIdNum)
    : undefined;
  const availableProperties = properties.filter(
    (p) => p.mortgageId == null || p.id === linkedPropertyId,
  );
  const ltvPreview =
    n(form.propertyValue) > 0
      ? ((n(form.outstandingBalance) / n(form.propertyValue)) * 100).toFixed(1)
      : null;
  const disableSave = saving || (!existing && availableProperties.length === 0);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden flex flex-col max-h-[90vh]">
        <MortgageModalHeader existing={existing} onClose={onClose} />
        <MortgageFormBody
          form={form}
          errors={errors}
          setField={setField}
          availableProperties={availableProperties}
          selectedProperty={selectedProperty}
          existing={existing}
          ltvPreview={ltvPreview}
        />
        <MortgageModalFooter
          saving={saving}
          existing={existing}
          disableSave={disableSave}
          onSave={() => {
            void handleSave();
          }}
          onClose={onClose}
        />
      </div>
    </div>
  );
}
