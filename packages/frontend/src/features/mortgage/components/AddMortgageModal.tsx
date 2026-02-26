import { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { CURRENCY_LIST, type CurrencyCode } from '@/lib/CurrencyContext';
import type { Mortgage as MortgageType, Property } from '@quro/shared';
import type { CreateMortgagePayload, UpdateMortgagePayload } from '../hooks';

export type MortgageFormPayload = (CreateMortgagePayload | UpdateMortgagePayload) & { id?: number };

type AddMortgageModalProps = {
  existing?: MortgageType;
  properties: Property[];
  linkedPropertyId: number | null;
  onClose: () => void;
  onSave: (mortgage: MortgageFormPayload) => Promise<void> | void;
};

type MortgageFormState = {
  linkedPropertyId: string;
  propertyAddress: string;
  lender: string;
  currency: CurrencyCode;
  originalAmount: string;
  outstandingBalance: string;
  propertyValue: string;
  monthlyPayment: string;
  interestRate: string;
  rateType: string;
  fixedUntil: string;
  termYears: string;
  startDate: string;
  endDate: string;
  overpaymentLimit: string;
};

export function AddMortgageModal({
  existing,
  properties,
  linkedPropertyId,
  onClose,
  onSave,
}: AddMortgageModalProps) {
  const [form, setForm] = useState<MortgageFormState>({
    linkedPropertyId: linkedPropertyId ? String(linkedPropertyId) : '',
    propertyAddress: existing?.propertyAddress ?? '',
    lender: existing?.lender ?? '',
    currency: (existing?.currency ?? 'EUR') as CurrencyCode,
    originalAmount: existing ? String(existing.originalAmount ?? '') : '',
    outstandingBalance: existing ? String(existing.outstandingBalance ?? '') : '',
    propertyValue: existing ? String(existing.propertyValue ?? '') : '',
    monthlyPayment: existing ? String(existing.monthlyPayment ?? '') : '',
    interestRate: existing ? String(existing.interestRate ?? '') : '',
    rateType: existing?.rateType ?? 'Fixed',
    fixedUntil: existing?.fixedUntil ?? '',
    termYears: existing ? String(existing.termYears ?? '') : '',
    startDate: existing?.startDate ?? '',
    endDate: existing?.endDate ?? '',
    overpaymentLimit: existing ? String(existing.overpaymentLimit ?? '10') : '10',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const linkedPropertyIdNum = form.linkedPropertyId
    ? Number.parseInt(form.linkedPropertyId, 10)
    : NaN;
  const selectedProperty = Number.isInteger(linkedPropertyIdNum)
    ? properties.find((property) => property.id === linkedPropertyIdNum)
    : undefined;
  const availableProperties = useMemo(
    () =>
      properties.filter(
        (property) => property.mortgageId == null || property.id === linkedPropertyId,
      ),
    [properties, linkedPropertyId],
  );

  const setField = <K extends keyof MortgageFormState>(field: K, value: MortgageFormState[K]) => {
    setForm((prev) => {
      const next = { ...prev, [field]: value };
      if (field === 'linkedPropertyId') {
        const selectedId = Number.parseInt(String(value), 10);
        const property = Number.isInteger(selectedId)
          ? properties.find((entry) => entry.id === selectedId)
          : undefined;
        if (property) {
          next.propertyAddress = property.address;
          next.currency = property.currency;
          next.propertyValue = property.currentValue.toString();
        }
      }
      return next;
    });
    setErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  const n = (value: string) => parseFloat(value) || 0;

  const validate = () => {
    const next: Record<string, string> = {};
    if (!form.linkedPropertyId) next.linkedPropertyId = 'Select a property to continue';
    if (!form.propertyAddress.trim()) next.propertyAddress = 'Required';
    if (!form.lender.trim()) next.lender = 'Required';
    if (!form.originalAmount || n(form.originalAmount) <= 0)
      next.originalAmount = 'Enter a valid amount';
    if (!form.outstandingBalance || n(form.outstandingBalance) < 0)
      next.outstandingBalance = 'Enter a valid amount';
    if (!form.propertyValue || n(form.propertyValue) <= 0)
      next.propertyValue = 'Enter a valid amount';
    if (!form.monthlyPayment || n(form.monthlyPayment) <= 0)
      next.monthlyPayment = 'Enter a valid amount';
    if (!form.interestRate || n(form.interestRate) <= 0) next.interestRate = 'Enter a valid rate';
    if (!form.termYears || n(form.termYears) <= 0) next.termYears = 'Enter term in years';
    return next;
  };

  const handleSave = async () => {
    const nextErrors = validate();
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    const payload: MortgageFormPayload = {
      linkedPropertyId: Number.parseInt(form.linkedPropertyId, 10),
      propertyAddress: form.propertyAddress.trim(),
      lender: form.lender.trim(),
      currency: form.currency,
      originalAmount: n(form.originalAmount),
      outstandingBalance: n(form.outstandingBalance),
      propertyValue: n(form.propertyValue),
      monthlyPayment: n(form.monthlyPayment),
      interestRate: n(form.interestRate),
      rateType: form.rateType,
      fixedUntil: form.rateType === 'Fixed' ? form.fixedUntil.trim() || 'N/A' : 'N/A',
      termYears: n(form.termYears),
      startDate: form.startDate.trim() || 'N/A',
      endDate: form.endDate.trim() || 'N/A',
      overpaymentLimit: n(form.overpaymentLimit) || 10,
      ...(existing ? { id: existing.id } : {}),
    };

    setSaving(true);
    try {
      await onSave(payload);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const ltvPreview =
    n(form.propertyValue) > 0
      ? ((n(form.outstandingBalance) / n(form.propertyValue)) * 100).toFixed(1)
      : null;

  const RATE_TYPES = ['Fixed', 'Variable', 'Tracker', 'Offset'];
  const disableSave = saving || (!existing && availableProperties.length === 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden flex flex-col max-h-[90vh]">
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

        <div className="p-6 space-y-5 overflow-y-auto">
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
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                    Currency
                  </label>
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
            </div>
          </div>

          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">
              Property Link
            </p>
            <select
              className={`w-full rounded-xl border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 ${
                errors.linkedPropertyId
                  ? 'border-rose-300 bg-rose-50'
                  : 'border-slate-200 bg-slate-50'
              }`}
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
                Using linked property details: {selectedProperty.address} (
                {selectedProperty.currency}).
              </p>
            )}
            {availableProperties.length === 0 && !existing && (
              <p className="text-xs text-amber-600 mt-2">
                No unlinked properties available. Add a property in Investments first.
              </p>
            )}
          </div>

          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">
              Loan Financials
            </p>
            <div className="grid grid-cols-2 gap-3">
              {[
                { field: 'originalAmount', label: 'Original Loan Amount', placeholder: '240000' },
                {
                  field: 'outstandingBalance',
                  label: 'Outstanding Balance',
                  placeholder: '218600',
                },
                { field: 'propertyValue', label: 'Current Property Value', placeholder: '362000' },
                { field: 'monthlyPayment', label: 'Monthly Payment', placeholder: '1280' },
              ].map(({ field, label, placeholder }) => (
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

          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">
              Rate & Term
            </p>
            <div className="grid grid-cols-2 gap-3">
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
                {errors.interestRate && (
                  <p className="text-xs text-rose-500 mt-1">{errors.interestRate}</p>
                )}
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                  Rate Type
                </label>
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
                {errors.termYears && (
                  <p className="text-xs text-rose-500 mt-1">{errors.termYears}</p>
                )}
              </div>
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
            </div>
          </div>

          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">
              Dates
            </p>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                  Start Date
                </label>
                <input
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  placeholder="e.g. March 2022"
                  value={form.startDate}
                  onChange={(e) => setField('startDate', e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                  End Date
                </label>
                <input
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  placeholder="e.g. March 2047"
                  value={form.endDate}
                  onChange={(e) => setField('endDate', e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                  Fixed Until
                </label>
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

          {ltvPreview && (
            <div
              className={`rounded-xl p-4 border flex items-center justify-between ${parseFloat(ltvPreview) < 70 ? 'bg-emerald-50 border-emerald-100' : parseFloat(ltvPreview) < 85 ? 'bg-amber-50 border-amber-100' : 'bg-rose-50 border-rose-100'}`}
            >
              <div>
                <p className="text-xs font-semibold text-slate-700">Loan-to-Value Preview</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {form.currency} {n(form.outstandingBalance).toLocaleString()} on {form.currency}{' '}
                  {n(form.propertyValue).toLocaleString()}
                </p>
              </div>
              <div className="text-right">
                <p
                  className={`font-black text-xl ${parseFloat(ltvPreview) < 70 ? 'text-emerald-600' : parseFloat(ltvPreview) < 85 ? 'text-amber-600' : 'text-rose-500'}`}
                >
                  {ltvPreview}%
                </p>
                <p className="text-[10px] text-slate-400">LTV</p>
              </div>
            </div>
          )}
        </div>

        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex gap-3 flex-shrink-0">
          <button
            onClick={onClose}
            className="flex-1 rounded-xl border border-slate-200 text-slate-600 py-2.5 text-sm hover:bg-slate-100 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              void handleSave();
            }}
            disabled={disableSave}
            className="flex-1 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white py-2.5 text-sm font-medium transition-colors"
          >
            {saving ? 'Saving...' : existing ? 'Save Changes' : 'Add Mortgage'}
          </button>
        </div>
      </div>
    </div>
  );
}
