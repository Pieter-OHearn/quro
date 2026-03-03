import { CURRENCY_CODES, CURRENCY_META, type CurrencyCode, type Payslip } from '@quro/shared';
import { Info, X } from 'lucide-react';
import { useAddPayslipForm } from '../hooks';
import type { PayslipFieldErrorMap, PayslipFormState } from '../types';

type AddPayslipModalProps = {
  onClose: () => void;
  onSave: (payslip: Omit<Payslip, 'id'>) => void;
  baseCurrency: CurrencyCode;
};

type NetPreviewProps = {
  net: number;
  gross: number;
  bonus: number;
  tax: number;
  pension: number;
  payCurrency: CurrencyCode;
};

function formatCurrency(amount: number, currency: CurrencyCode) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function NetPreview({ net, gross, bonus, tax, pension, payCurrency }: Readonly<NetPreviewProps>) {
  return (
    <div
      className={`rounded-xl p-4 border ${net >= 0 ? 'bg-emerald-50 border-emerald-100' : 'bg-rose-50 border-rose-100'}`}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Info size={15} className={net >= 0 ? 'text-emerald-600' : 'text-rose-500'} />
          <p className="text-sm font-semibold text-slate-700">Calculated Take-Home</p>
        </div>
        <p className={`font-bold ${net >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
          {net >= 0 ? formatCurrency(net, payCurrency) : 'Check values'}
        </p>
      </div>
      {gross > 0 && (
        <div className="flex h-2 rounded-full overflow-hidden gap-px">
          {[
            { id: 'net', pct: Math.max((net / (gross + bonus)) * 100, 0), color: 'bg-emerald-500' },
            { id: 'tax', pct: (tax / (gross + bonus)) * 100, color: 'bg-rose-400' },
            { id: 'pension', pct: (pension / (gross + bonus)) * 100, color: 'bg-indigo-400' },
          ]
            .filter((segment) => segment.pct > 0)
            .map((segment) => (
              <div
                key={segment.id}
                className={`h-full ${segment.color}`}
                style={{ width: `${segment.pct}%` }}
              />
            ))}
        </div>
      )}
      <p className="text-xs text-slate-400 mt-1.5">
        Gross{bonus > 0 ? ' + Bonus' : ''} − Tax − Pension
      </p>
    </div>
  );
}

type TextFieldProps = {
  label: string;
  placeholder?: string;
  required?: boolean;
  type?: string;
  value: string;
  error?: string;
  onChange: (value: string) => void;
};

function PayslipTextField({
  label,
  placeholder,
  required,
  type = 'text',
  value,
  error,
  onChange,
}: Readonly<TextFieldProps>) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-600 mb-1.5">
        {label} {required && <span className="text-rose-500">*</span>}
      </label>
      <input
        type={type}
        className={`w-full rounded-xl border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 ${error ? 'border-rose-300 bg-rose-50' : 'border-slate-200 bg-slate-50'}`}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      {error && <p className="text-xs text-rose-500 mt-1">{error}</p>}
    </div>
  );
}

type FormFieldSetter = <K extends keyof PayslipFormState>(
  field: K,
  value: PayslipFormState[K],
) => void;

type PayslipFormPartProps = {
  form: PayslipFormState;
  errors: PayslipFieldErrorMap;
  set: FormFieldSetter;
};

function PayslipCurrencySelector({ form, errors, set }: Readonly<PayslipFormPartProps>) {
  return (
    <div>
      <p className="block text-xs font-semibold text-slate-600 mb-2">
        Pay Currency <span className="text-rose-500">*</span>
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {CURRENCY_CODES.map((currency) => {
          const active = currency === form.currency;
          const meta = CURRENCY_META[currency];
          return (
            <button
              key={currency}
              type="button"
              onClick={() => set('currency', currency)}
              className={`rounded-xl border px-2.5 py-2 text-sm font-medium transition-colors ${
                active
                  ? 'bg-indigo-600 border-indigo-500 text-white shadow-sm'
                  : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
              }`}
            >
              <span className="mr-1.5">{meta.flag}</span>
              <span>{currency}</span>
            </button>
          );
        })}
      </div>
      {errors.currency && <p className="text-xs text-rose-500 mt-1">{errors.currency}</p>}
    </div>
  );
}

function PayslipPeriodRow({ form, errors, set }: Readonly<PayslipFormPartProps>) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <PayslipTextField
        label="Pay Period"
        placeholder="e.g. Mar 2026"
        required
        value={form.month}
        error={errors.month}
        onChange={(value) => set('month', value)}
      />
      <PayslipTextField
        label="Pay Date"
        type="date"
        required
        value={form.date}
        error={errors.date}
        onChange={(value) => set('date', value)}
      />
    </div>
  );
}

function PayslipGrossBonusRow({ form, errors, set }: Readonly<PayslipFormPartProps>) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <PayslipTextField
        label={`Gross Pay (${form.currency})`}
        placeholder="Enter gross pay"
        required
        type="number"
        value={form.gross}
        error={errors.gross}
        onChange={(value) => set('gross', value)}
      />
      <div>
        <label className="block text-xs font-semibold text-slate-600 mb-1.5">
          Bonus ({form.currency}) <span className="text-slate-400 font-normal">optional</span>
        </label>
        <input
          type="number"
          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
          placeholder="0"
          value={form.bonus}
          onChange={(event) => set('bonus', event.target.value)}
        />
      </div>
    </div>
  );
}

function PayslipDeductionsRow({ form, errors, set }: Readonly<PayslipFormPartProps>) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Deductions</p>
        <div className="flex-1 h-px bg-slate-100" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <PayslipTextField
          label={`Income Tax (${form.currency})`}
          placeholder="Enter tax amount"
          required
          type="number"
          value={form.tax}
          error={errors.tax}
          onChange={(value) => set('tax', value)}
        />
        <PayslipTextField
          label={`Pension (${form.currency})`}
          placeholder="Enter pension amount"
          required
          type="number"
          value={form.pension}
          error={errors.pension}
          onChange={(value) => set('pension', value)}
        />
      </div>
    </div>
  );
}

type PayslipFormBodyProps = PayslipFormPartProps & {
  net: number;
  gross: number;
  bonus: number;
  tax: number;
  pension: number;
};

function PayslipFormBody({
  form,
  errors,
  set,
  net,
  gross,
  bonus,
  tax,
  pension,
}: Readonly<PayslipFormBodyProps>) {
  return (
    <div className="p-6 space-y-5 overflow-y-auto max-h-[75vh]">
      <PayslipCurrencySelector form={form} errors={errors} set={set} />
      <PayslipPeriodRow form={form} errors={errors} set={set} />
      <PayslipGrossBonusRow form={form} errors={errors} set={set} />
      <PayslipDeductionsRow form={form} errors={errors} set={set} />
      <NetPreview
        net={net}
        gross={gross}
        bonus={bonus}
        tax={tax}
        pension={pension}
        payCurrency={form.currency}
      />
    </div>
  );
}

function PayslipModalHeader({
  payCurrency,
  baseCurrency,
  onClose,
}: Readonly<{ payCurrency: CurrencyCode; baseCurrency: CurrencyCode; onClose: () => void }>) {
  return (
    <div className="bg-gradient-to-r from-[#0a0f1e] to-[#1a1f3e] px-6 py-5 flex items-center justify-between">
      <div>
        <h2 className="font-bold text-white">Add Payslip</h2>
        <p className="text-xs text-indigo-300 mt-0.5">
          Amounts in {payCurrency} · Base currency {baseCurrency}
        </p>
      </div>
      <button
        onClick={onClose}
        className="p-2 rounded-xl hover:bg-white/10 text-slate-400 hover:text-white"
      >
        <X size={18} />
      </button>
    </div>
  );
}

export function AddPayslipModal({ onClose, onSave, baseCurrency }: Readonly<AddPayslipModalProps>) {
  const { form, errors, set, gross, tax, pension, bonus, net, handleSave } = useAddPayslipForm({
    onSave,
    onClose,
    baseCurrency,
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
        <PayslipModalHeader
          payCurrency={form.currency}
          baseCurrency={baseCurrency}
          onClose={onClose}
        />
        <PayslipFormBody
          form={form}
          errors={errors}
          set={set}
          net={net}
          gross={gross}
          bonus={bonus}
          tax={tax}
          pension={pension}
        />
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 rounded-xl border border-slate-200 text-slate-600 py-2.5 text-sm hover:bg-slate-100 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="flex-1 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white py-2.5 text-sm transition-colors font-medium"
          >
            Save Payslip
          </button>
        </div>
      </div>
    </div>
  );
}
