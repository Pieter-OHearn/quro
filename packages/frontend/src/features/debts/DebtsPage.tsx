/* eslint-disable complexity, max-lines-per-function */

import { useMemo, useState, type ElementType } from 'react';
import type { Debt, DebtPayment, DebtType } from '@quro/shared';
import {
  AlertTriangle,
  Banknote,
  Calendar,
  Car,
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  CreditCard,
  Edit3,
  GraduationCap,
  Info,
  MoreHorizontal,
  Percent,
  Plus,
  Target,
  Trash2,
  TrendingDown,
  User,
  X,
} from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  ContentSection,
  CurrencyInput,
  DateInput,
  EmojiPickerField,
  EmptyState,
  FormField,
  IconButton,
  LoadingState,
  Modal,
  ModalHeader,
  PageStack,
  SelectInput,
  TextInput,
  Textarea,
} from '@/components/ui';
import { CURRENCY_CODES, type CurrencyCode, useCurrency } from '@/lib/CurrencyContext';
import {
  useCreateDebt,
  useCreateDebtPayment,
  useDebtPayments,
  useDebts,
  useDeleteDebt,
  useDeleteDebtPayment,
  useUpdateDebt,
} from './hooks';
import type {
  CreateDebtPayload,
  CreateDebtPaymentPayload,
  DebtFilterValue,
  DebtFormState,
  DebtPaymentFormState,
} from './types';
import {
  buildDebtOverview,
  calculateDebtPaidAmount,
  calculateDebtPaidPercentage,
  estimateDebtMonthlyInterest,
  estimateDebtRemainingInterest,
  formatDebtPayoffLabel,
} from './utils/debt-metrics';

const DEBT_COLORS = ['#6366f1', '#0ea5e9', '#ef4444', '#f59e0b', '#10b981', '#ec4899', '#8b5cf6'];

const DEFAULT_EMOJI_BY_TYPE: Record<DebtType, string> = {
  car_loan: '🚗',
  student_loan: '🎓',
  personal_loan: '💼',
  credit_card: '💳',
  overdraft: '⚠️',
  other: '📋',
};

const DEBT_TYPE_META: Record<
  DebtType,
  {
    label: string;
    icon: ElementType;
    toneClassName: string;
  }
> = {
  car_loan: {
    label: 'Car Loan',
    icon: Car,
    toneClassName: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  },
  student_loan: {
    label: 'Student Loan',
    icon: GraduationCap,
    toneClassName: 'bg-sky-50 text-sky-700 border-sky-200',
  },
  personal_loan: {
    label: 'Personal Loan',
    icon: User,
    toneClassName: 'bg-amber-50 text-amber-700 border-amber-200',
  },
  credit_card: {
    label: 'Credit Card',
    icon: CreditCard,
    toneClassName: 'bg-rose-50 text-rose-700 border-rose-200',
  },
  overdraft: {
    label: 'Overdraft',
    icon: AlertTriangle,
    toneClassName: 'bg-orange-50 text-orange-700 border-orange-200',
  },
  other: {
    label: 'Other',
    icon: MoreHorizontal,
    toneClassName: 'bg-slate-100 text-slate-700 border-slate-200',
  },
};

const FILTER_OPTIONS: Array<{ key: DebtFilterValue; label: string; icon: ElementType }> = [
  { key: 'all', label: 'All', icon: Banknote },
  { key: 'car_loan', label: 'Car', icon: Car },
  { key: 'student_loan', label: 'Student', icon: GraduationCap },
  { key: 'credit_card', label: 'Credit Card', icon: CreditCard },
  { key: 'personal_loan', label: 'Personal', icon: User },
  { key: 'overdraft', label: 'Overdraft', icon: AlertTriangle },
  { key: 'other', label: 'Other', icon: MoreHorizontal },
];

const EMPTY_DEBT_FORM: DebtFormState = {
  name: '',
  type: 'car_loan',
  lender: '',
  originalAmount: '',
  remainingBalance: '',
  currency: 'EUR',
  interestRate: '',
  monthlyPayment: '',
  startDate: '',
  endDate: '',
  color: DEBT_COLORS[0],
  emoji: DEFAULT_EMOJI_BY_TYPE.car_loan,
  notes: '',
};

type DebtFormErrors = Partial<Record<keyof DebtFormState, string>> & {
  submit?: string;
};

type DebtPaymentErrors = Partial<Record<keyof DebtPaymentFormState, string>> & {
  submit?: string;
};

function getApiErrorMessage(error: unknown, fallback: string) {
  if (
    typeof error === 'object' &&
    error !== null &&
    'response' in error &&
    typeof error.response === 'object' &&
    error.response !== null &&
    'data' in error.response &&
    typeof error.response.data === 'object' &&
    error.response.data !== null &&
    'error' in error.response.data &&
    typeof error.response.data.error === 'string'
  ) {
    return error.response.data.error;
  }

  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

function formatShortDate(isoDate: string) {
  return new Date(isoDate).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
  });
}

function parseAmount(value: string) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toDebtFormState(debt: Debt): DebtFormState {
  return {
    name: debt.name,
    type: debt.type,
    lender: debt.lender,
    originalAmount: String(debt.originalAmount),
    remainingBalance: String(debt.remainingBalance),
    currency: debt.currency,
    interestRate: String(debt.interestRate),
    monthlyPayment: String(debt.monthlyPayment),
    startDate: debt.startDate,
    endDate: debt.endDate ?? '',
    color: debt.color,
    emoji: debt.emoji,
    notes: debt.notes ?? '',
  };
}

function validateDebtForm(form: DebtFormState) {
  const errors: DebtFormErrors = {};

  const originalAmount = parseAmount(form.originalAmount);
  if (originalAmount == null || originalAmount <= 0) {
    errors.originalAmount = 'Enter an original amount above 0.';
  }

  const remainingBalance = parseAmount(form.remainingBalance);
  if (remainingBalance == null || remainingBalance < 0) {
    errors.remainingBalance = 'Enter a remaining balance of 0 or more.';
  }

  if (originalAmount != null && remainingBalance != null && remainingBalance > originalAmount) {
    errors.remainingBalance = 'Remaining balance cannot exceed the original amount.';
  }

  const interestRate = parseAmount(form.interestRate);
  if (interestRate == null || interestRate < 0) {
    errors.interestRate = 'Enter an APR of 0 or more.';
  }

  const monthlyPayment = parseAmount(form.monthlyPayment);
  if (monthlyPayment == null || monthlyPayment < 0) {
    errors.monthlyPayment = 'Enter a monthly payment of 0 or more.';
  }

  if (!form.name.trim()) errors.name = 'Debt name is required.';
  if (!form.lender.trim()) errors.lender = 'Lender is required.';
  if (!form.startDate) errors.startDate = 'Start date is required.';
  if (form.endDate && form.endDate < form.startDate) {
    errors.endDate = 'End date cannot be earlier than the start date.';
  }
  if (!form.emoji.trim()) errors.emoji = 'Choose an emoji.';
  if (!form.color.trim()) errors.color = 'Choose a colour.';

  if (Object.keys(errors).length > 0) return { ok: false as const, errors };

  return {
    ok: true as const,
    payload: {
      name: form.name.trim(),
      type: form.type,
      lender: form.lender.trim(),
      originalAmount: originalAmount ?? 0,
      remainingBalance: remainingBalance ?? 0,
      currency: form.currency,
      interestRate: interestRate ?? 0,
      monthlyPayment: monthlyPayment ?? 0,
      startDate: form.startDate,
      endDate: form.endDate || null,
      color: form.color,
      emoji: form.emoji.trim(),
      notes: form.notes.trim() ? form.notes.trim() : null,
    } satisfies CreateDebtPayload,
  };
}

function buildInitialPaymentForm(debt: Debt): DebtPaymentFormState {
  const estimatedInterest = estimateDebtMonthlyInterest(debt);
  const amount = Math.max(debt.monthlyPayment, estimatedInterest);

  return {
    date: new Date().toISOString().slice(0, 10),
    amount: amount > 0 ? amount.toFixed(2) : '',
    interest: estimatedInterest > 0 ? estimatedInterest.toFixed(2) : '0',
    note: 'Monthly payment',
  };
}

function validateDebtPaymentForm(form: DebtPaymentFormState, debt: Debt) {
  const errors: DebtPaymentErrors = {};

  const amount = parseAmount(form.amount);
  if (amount == null || amount <= 0) {
    errors.amount = 'Enter a payment amount above 0.';
  }

  const interest = parseAmount(form.interest);
  if (interest == null || interest < 0) {
    errors.interest = 'Interest must be 0 or more.';
  }

  if (amount != null && interest != null && interest > amount) {
    errors.interest = 'Interest cannot exceed the total payment.';
  }

  if (!form.date) errors.date = 'Payment date is required.';

  const principal =
    amount != null && interest != null ? Number.parseFloat((amount - interest).toFixed(2)) : 0;
  if (principal > debt.remainingBalance) {
    errors.amount = 'This payment would reduce more principal than the remaining balance.';
  }

  if (Object.keys(errors).length > 0) return { ok: false as const, errors };

  return {
    ok: true as const,
    payload: {
      debtId: debt.id,
      date: form.date,
      amount: amount ?? 0,
      interest: interest ?? 0,
      note: form.note.trim(),
    } satisfies CreateDebtPaymentPayload,
    principal,
  };
}

function SummaryBanner({ debts }: Readonly<{ debts: readonly Debt[] }>) {
  const { fmtBase, convertToBase } = useCurrency();
  const overview = useMemo(() => buildDebtOverview(debts, convertToBase), [debts, convertToBase]);

  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#0a0f1e] via-[#1a0a1e] to-[#1e0a14] p-6 text-white">
      <div className="absolute -right-10 -top-14 h-64 w-64 rounded-full bg-rose-500/10" />
      <div className="absolute bottom-0 left-20 h-44 w-44 translate-y-1/2 rounded-full bg-indigo-500/10" />
      <div className="relative z-10 flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-rose-300">
            <TrendingDown size={16} className="text-rose-400" />
            <span className="text-sm font-medium">Liabilities Overview</span>
          </div>
          <p className="text-3xl font-bold">{fmtBase(overview.totalBalance)}</p>
          <p className="mt-1 text-sm text-slate-400">
            Total outstanding across {overview.debtCount} debt
            {overview.debtCount === 1 ? '' : 's'}
          </p>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {[
            { label: 'Monthly Payments', value: fmtBase(overview.totalMonthlyPayment), icon: '📅' },
            {
              label: 'Avg Interest',
              value: `${overview.averageInterestRate.toFixed(2)}% APR`,
              icon: '📊',
            },
            {
              label: 'Highest Rate',
              value: `${overview.highestInterestRate.toFixed(2)}% APR`,
              icon: '⚠️',
            },
          ].map((metric) => (
            <div
              key={metric.label}
              className="rounded-xl bg-white/8 px-4 py-3 text-center backdrop-blur-sm"
            >
              <p className="text-lg">{metric.icon}</p>
              <p className="text-sm font-bold text-white">{metric.value}</p>
              <p className="mt-0.5 text-[10px] text-slate-400">{metric.label}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function FilterPills({
  debts,
  value,
  onChange,
}: Readonly<{
  debts: readonly Debt[];
  value: DebtFilterValue;
  onChange: (value: DebtFilterValue) => void;
}>) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {FILTER_OPTIONS.filter(
        (option) => option.key === 'all' || debts.some((debt) => debt.type === option.key),
      ).map((option) => {
        const Icon = option.icon;
        const isActive = option.key === value;
        const count =
          option.key === 'all'
            ? debts.length
            : debts.filter((debt) => debt.type === option.key).length;

        return (
          <button
            key={option.key}
            type="button"
            onClick={() => onChange(option.key)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
              isActive
                ? 'border-slate-900 bg-slate-900 text-white'
                : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'
            }`}
          >
            <Icon size={11} />
            {option.label}
            {option.key !== 'all' ? (
              <span
                className={`rounded-full px-1 text-[9px] font-semibold ${
                  isActive ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'
                }`}
              >
                {count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

function PaymentHistory({
  debt,
  payments,
  onLogPayment,
  onDeletePayment,
}: Readonly<{
  debt: Debt;
  payments: readonly DebtPayment[];
  onLogPayment: () => void;
  onDeletePayment: (id: number) => void;
}>) {
  const { fmtNative } = useCurrency();
  const sortedPayments = [...payments].sort((left, right) => right.date.localeCompare(left.date));

  return (
    <div className="mt-4 border-t border-slate-100 pt-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
          Payment History
        </p>
        <Button
          size="sm"
          className="bg-emerald-600 hover:bg-emerald-700"
          leadingIcon={<Plus size={12} />}
          onClick={onLogPayment}
        >
          Log Payment
        </Button>
      </div>

      {sortedPayments.length === 0 ? (
        <div className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50 px-4 py-4 text-slate-400">
          <Clock size={16} className="flex-shrink-0" />
          <span className="text-sm">No payments recorded yet.</span>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-100">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="px-3 py-2 text-left font-semibold uppercase tracking-wide text-slate-400">
                  Date
                </th>
                <th className="px-3 py-2 text-right font-semibold uppercase tracking-wide text-slate-400">
                  Amount
                </th>
                <th className="px-3 py-2 text-right font-semibold uppercase tracking-wide text-slate-400">
                  Principal
                </th>
                <th className="px-3 py-2 text-right font-semibold uppercase tracking-wide text-slate-400">
                  Interest
                </th>
                <th className="w-10 px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {sortedPayments.map((payment) => (
                <tr key={payment.id} className="group hover:bg-slate-50/60">
                  <td className="px-3 py-2.5 text-slate-600">{formatShortDate(payment.date)}</td>
                  <td className="px-3 py-2.5 text-right font-semibold text-slate-800">
                    {fmtNative(payment.amount, debt.currency, true)}
                  </td>
                  <td className="px-3 py-2.5 text-right font-medium text-emerald-600">
                    {fmtNative(payment.principal, debt.currency, true)}
                  </td>
                  <td className="px-3 py-2.5 text-right text-rose-500">
                    {fmtNative(payment.interest, debt.currency, true)}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <button
                      type="button"
                      onClick={() => onDeletePayment(payment.id)}
                      className="rounded-md p-1 text-slate-300 opacity-0 transition-all hover:bg-rose-50 hover:text-rose-500 group-hover:opacity-100"
                    >
                      <Trash2 size={12} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function DebtCard({
  debt,
  payments,
  expanded,
  onToggle,
  onEdit,
  onDelete,
  onLogPayment,
  onDeletePayment,
}: Readonly<{
  debt: Debt;
  payments: readonly DebtPayment[];
  expanded: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onLogPayment: () => void;
  onDeletePayment: (id: number) => void;
}>) {
  const { fmtBase, fmtNative, isForeign } = useCurrency();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const typeMeta = DEBT_TYPE_META[debt.type];
  const TypeIcon = typeMeta.icon;
  const paidAmount = calculateDebtPaidAmount(debt);
  const paidPercentage = calculateDebtPaidPercentage(debt);
  const remainingInterest = estimateDebtRemainingInterest(debt);
  const payoffLabel = formatDebtPayoffLabel(debt);
  const highInterest = debt.interestRate >= 10;

  return (
    <Card
      padding="none"
      className={`overflow-hidden border transition-all duration-200 ${
        expanded ? 'border-slate-300 shadow-lg' : 'border-slate-100 shadow-sm hover:shadow-md'
      }`}
    >
      <div className="h-1 w-full" style={{ backgroundColor: debt.color }} />
      <div className="p-5">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div
              className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl text-xl"
              style={{ backgroundColor: `${debt.color}1a` }}
            >
              {debt.emoji}
            </div>
            <div className="min-w-0">
              <p className="truncate font-semibold text-slate-900">{debt.name}</p>
              <div className="mt-0.5 flex flex-wrap items-center gap-2">
                <Badge size="xs" className={`border ${typeMeta.toneClassName}`}>
                  <TypeIcon size={8} />
                  {typeMeta.label}
                </Badge>
                <span className="truncate text-[10px] text-slate-400">{debt.lender}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <IconButton
              icon={Edit3}
              label="Edit debt"
              variant="subtle"
              size="md"
              onClick={onEdit}
            />
            {confirmDelete ? (
              <>
                <IconButton
                  icon={Check}
                  label="Confirm delete debt"
                  variant="subtle"
                  size="md"
                  className="bg-rose-500 text-white hover:bg-rose-600 hover:text-white"
                  onClick={() => {
                    onDelete();
                    setConfirmDelete(false);
                  }}
                />
                <IconButton
                  icon={X}
                  label="Cancel delete debt"
                  variant="subtle"
                  size="md"
                  onClick={() => setConfirmDelete(false)}
                />
              </>
            ) : (
              <IconButton
                icon={Trash2}
                label="Delete debt"
                variant="subtle"
                size="md"
                onClick={() => setConfirmDelete(true)}
              />
            )}
          </div>
        </div>

        <div className="mb-3 flex items-end justify-between">
          <div>
            <p className="mb-0.5 text-[10px] uppercase tracking-wide text-slate-400">Remaining</p>
            <p className="text-xl font-bold text-slate-900">
              {fmtNative(debt.remainingBalance, debt.currency)}
            </p>
            {isForeign(debt.currency) ? (
              <p className="text-[11px] text-slate-400">
                ≈ {fmtBase(debt.remainingBalance, debt.currency)}
              </p>
            ) : null}
          </div>
          <div className="text-right">
            <p className="mb-0.5 text-[10px] uppercase tracking-wide text-slate-400">Original</p>
            <p className="text-sm text-slate-500">
              {fmtNative(debt.originalAmount, debt.currency)}
            </p>
          </div>
        </div>

        <div className="mb-4">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[10px] text-slate-400">
              {paidPercentage.toFixed(0)}% paid off
            </span>
            <span className="text-[10px] text-slate-400">
              {fmtNative(paidAmount, debt.currency)} repaid
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${paidPercentage}%`, backgroundColor: debt.color }}
            />
          </div>
        </div>

        <div className="mb-4 grid grid-cols-3 gap-2">
          {[
            {
              label: 'APR',
              value: `${debt.interestRate.toFixed(2)}%`,
              icon: Percent,
              className: highInterest
                ? 'bg-rose-50 border-rose-100 text-rose-600'
                : 'bg-slate-50 border-slate-100 text-slate-700',
              iconClassName: highInterest ? 'text-rose-400' : 'text-slate-400',
            },
            {
              label: 'Monthly',
              value: fmtNative(debt.monthlyPayment, debt.currency),
              icon: Calendar,
              className: 'bg-slate-50 border-slate-100 text-slate-700',
              iconClassName: 'text-slate-400',
            },
            {
              label: 'Payoff',
              value: payoffLabel,
              icon: Target,
              className: 'bg-slate-50 border-slate-100 text-slate-700',
              iconClassName: 'text-slate-400',
            },
          ].map((item) => {
            const Icon = item.icon;

            return (
              <div
                key={item.label}
                className={`rounded-xl border px-3 py-2 text-center ${item.className}`}
              >
                <Icon size={11} className={`mx-auto mb-0.5 ${item.iconClassName}`} />
                <p className="text-[11px] font-semibold">{item.value}</p>
                <p className="text-[9px] uppercase tracking-wide text-slate-400">{item.label}</p>
              </div>
            );
          })}
        </div>

        {highInterest && remainingInterest != null ? (
          <div className="mb-3 flex items-start gap-2 rounded-xl border border-rose-100 bg-rose-50 px-3 py-2">
            <AlertTriangle size={12} className="mt-0.5 flex-shrink-0 text-rose-500" />
            <p className="text-[11px] text-rose-700">
              High interest. Estimated remaining interest is{' '}
              <span className="font-semibold">
                {fmtNative(remainingInterest, debt.currency, true)}
              </span>
              .
            </p>
          </div>
        ) : null}

        <button
          type="button"
          onClick={onToggle}
          className="flex w-full items-center justify-center gap-1.5 py-1 text-xs text-slate-400 transition-colors hover:text-slate-700"
        >
          {expanded ? (
            <>
              <ChevronUp size={13} />
              Hide history
            </>
          ) : (
            <>
              <ChevronDown size={13} />
              Payment history ({payments.length})
            </>
          )}
        </button>
      </div>

      {expanded ? (
        <div className="px-5 pb-5">
          <PaymentHistory
            debt={debt}
            payments={payments}
            onLogPayment={onLogPayment}
            onDeletePayment={onDeletePayment}
          />
        </div>
      ) : null}
    </Card>
  );
}

function DebtFormModal({
  debt,
  onClose,
  onSubmit,
}: Readonly<{
  debt: Debt | null;
  onClose: () => void;
  onSubmit: (payload: CreateDebtPayload, debtId?: number) => Promise<void>;
}>) {
  const [form, setForm] = useState<DebtFormState>(debt ? toDebtFormState(debt) : EMPTY_DEBT_FORM);
  const [errors, setErrors] = useState<DebtFormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const editing = Boolean(debt);

  const handleChange = <K extends keyof DebtFormState>(key: K, value: DebtFormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined, submit: undefined }));
  };

  const handleTypeChange = (nextType: string) => {
    const debtType = nextType as DebtType;
    setForm((current) => ({
      ...current,
      type: debtType,
      emoji: editing ? current.emoji : DEFAULT_EMOJI_BY_TYPE[debtType],
    }));
    setErrors((current) => ({ ...current, type: undefined, emoji: undefined, submit: undefined }));
  };

  const submit = async () => {
    const validation = validateDebtForm(form);
    if (!validation.ok) {
      setErrors(validation.errors);
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit(validation.payload, debt?.id);
      onClose();
    } catch (error) {
      setErrors((current) => ({
        ...current,
        submit: getApiErrorMessage(error, 'Unable to save this debt right now.'),
      }));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      title={editing ? 'Edit Debt' : 'Add New Debt'}
      subtitle="Track a liability"
      onClose={onClose}
      maxWidth="lg"
      scrollable
      header={
        <ModalHeader
          title={editing ? 'Edit Debt' : 'Add New Debt'}
          subtitle="Track a liability"
          onClose={onClose}
          scrollable
          visual={
            <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-rose-500/20 text-rose-200">
              <Banknote size={18} />
            </div>
          }
        />
      }
      footer={
        <>
          <Button onClick={onClose} variant="secondary" size="lg" className="flex-1">
            Cancel
          </Button>
          <Button
            onClick={() => {
              void submit();
            }}
            size="lg"
            loading={submitting}
            loadingLabel={editing ? 'Saving Changes...' : 'Adding Debt...'}
            className="flex-1 bg-rose-600 hover:bg-rose-700"
          >
            {editing ? 'Save Changes' : 'Add Debt'}
          </Button>
        </>
      }
    >
      <div className="grid items-start gap-4 md:grid-cols-[max-content_minmax(0,1fr)]">
        <EmojiPickerField
          label="Icon"
          value={form.emoji}
          onChange={(emoji) => handleChange('emoji', emoji)}
          error={errors.emoji}
        />
        <FormField label="Debt Name" required error={errors.name}>
          <TextInput
            value={form.name}
            onChange={(value) => handleChange('name', value)}
            placeholder="e.g. Volkswagen Golf Loan"
            error={Boolean(errors.name)}
          />
        </FormField>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <FormField label="Debt Type" required error={errors.type}>
          <SelectInput
            value={form.type}
            onChange={handleTypeChange}
            options={Object.entries(DEBT_TYPE_META).map(([value, meta]) => ({
              value,
              label: meta.label,
            }))}
            error={Boolean(errors.type)}
          />
        </FormField>

        <FormField label="Lender / Provider" required error={errors.lender}>
          <TextInput
            value={form.lender}
            onChange={(value) => handleChange('lender', value)}
            placeholder="e.g. Volkskrediet Bank"
            error={Boolean(errors.lender)}
          />
        </FormField>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <FormField label="Original Amount" required error={errors.originalAmount}>
          <CurrencyInput
            currency={form.currency}
            value={form.originalAmount}
            onChange={(value) => handleChange('originalAmount', value)}
            error={Boolean(errors.originalAmount)}
          />
        </FormField>
        <FormField label="Remaining Balance" required error={errors.remainingBalance}>
          <CurrencyInput
            currency={form.currency}
            value={form.remainingBalance}
            onChange={(value) => handleChange('remainingBalance', value)}
            error={Boolean(errors.remainingBalance)}
          />
        </FormField>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <FormField label="APR %" required error={errors.interestRate}>
          <TextInput
            type="number"
            step="0.01"
            min="0"
            value={form.interestRate}
            onChange={(value) => handleChange('interestRate', value)}
            error={Boolean(errors.interestRate)}
          />
        </FormField>
        <FormField label="Monthly Payment" required error={errors.monthlyPayment}>
          <CurrencyInput
            currency={form.currency}
            value={form.monthlyPayment}
            onChange={(value) => handleChange('monthlyPayment', value)}
            error={Boolean(errors.monthlyPayment)}
          />
        </FormField>
        <FormField label="Currency">
          <SelectInput
            value={form.currency}
            onChange={(value) => handleChange('currency', value as CurrencyCode)}
            options={[...CURRENCY_CODES]}
          />
        </FormField>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <FormField label="Start Date" required error={errors.startDate}>
          <DateInput
            value={form.startDate}
            onChange={(value) => handleChange('startDate', value)}
            error={Boolean(errors.startDate)}
          />
        </FormField>
        <FormField label="End Date" hint="optional" error={errors.endDate}>
          <DateInput
            value={form.endDate}
            onChange={(value) => handleChange('endDate', value)}
            error={Boolean(errors.endDate)}
          />
        </FormField>
      </div>

      <FormField label="Colour Tag" required error={errors.color}>
        <div className="flex flex-wrap items-center gap-2">
          {DEBT_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              onClick={() => handleChange('color', color)}
              className={`h-7 w-7 rounded-full border-2 transition-transform hover:scale-110 ${
                form.color === color ? 'border-slate-800' : 'border-transparent'
              }`}
              style={{ backgroundColor: color }}
            />
          ))}
        </div>
      </FormField>

      <FormField label="Notes" hint="optional" error={errors.notes}>
        <Textarea
          value={form.notes}
          onChange={(value) => handleChange('notes', value)}
          rows={3}
          placeholder="e.g. Early repayment allowed with no penalty"
          error={Boolean(errors.notes)}
        />
      </FormField>

      {errors.submit ? <p className="text-sm text-rose-500">{errors.submit}</p> : null}
    </Modal>
  );
}

function DebtPaymentModal({
  debt,
  onClose,
  onSubmit,
}: Readonly<{
  debt: Debt;
  onClose: () => void;
  onSubmit: (payload: CreateDebtPaymentPayload) => Promise<void>;
}>) {
  const { fmtNative } = useCurrency();
  const [form, setForm] = useState<DebtPaymentFormState>(() => buildInitialPaymentForm(debt));
  const [errors, setErrors] = useState<DebtPaymentErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const monthlyInterest = estimateDebtMonthlyInterest(debt);
  const validation = validateDebtPaymentForm(form, debt);
  const principalPreview = validation.ok ? validation.principal : 0;

  const handleChange = <K extends keyof DebtPaymentFormState>(
    key: K,
    value: DebtPaymentFormState[K],
  ) => {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined, submit: undefined }));
  };

  const submit = async () => {
    const nextValidation = validateDebtPaymentForm(form, debt);
    if (!nextValidation.ok) {
      setErrors(nextValidation.errors);
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit(nextValidation.payload);
      onClose();
    } catch (error) {
      setErrors((current) => ({
        ...current,
        submit: getApiErrorMessage(error, 'Unable to log this payment right now.'),
      }));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      title="Log Payment"
      subtitle={debt.name}
      onClose={onClose}
      maxWidth="sm"
      header={
        <ModalHeader
          title="Log Payment"
          subtitle={debt.name}
          onClose={onClose}
          visual={<div className="mb-3 text-3xl">{debt.emoji}</div>}
        />
      }
      footer={
        <>
          <Button onClick={onClose} variant="secondary" size="lg" className="flex-1">
            Cancel
          </Button>
          <Button
            onClick={() => {
              void submit();
            }}
            size="lg"
            loading={submitting}
            loadingLabel="Logging Payment..."
            className="flex-1 bg-emerald-600 hover:bg-emerald-700"
          >
            Log Payment
          </Button>
        </>
      }
    >
      <div className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
        <div className="flex-1">
          <p className="text-[10px] uppercase tracking-wide text-slate-400">Current Balance</p>
          <p className="text-sm font-bold text-slate-800">
            {fmtNative(debt.remainingBalance, debt.currency)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[10px] uppercase tracking-wide text-slate-400">Monthly Interest</p>
          <p className="text-sm font-semibold text-rose-500">
            {fmtNative(monthlyInterest, debt.currency, true)}
          </p>
        </div>
      </div>

      <FormField label="Date" required error={errors.date}>
        <DateInput
          value={form.date}
          onChange={(value) => handleChange('date', value)}
          error={Boolean(errors.date)}
        />
      </FormField>

      <div className="grid gap-4 md:grid-cols-2">
        <FormField label="Total Payment" required error={errors.amount}>
          <CurrencyInput
            currency={debt.currency}
            value={form.amount}
            onChange={(value) => handleChange('amount', value)}
            error={Boolean(errors.amount)}
          />
        </FormField>
        <FormField label="Interest Portion" required error={errors.interest}>
          <CurrencyInput
            currency={debt.currency}
            value={form.interest}
            onChange={(value) => handleChange('interest', value)}
            error={Boolean(errors.interest)}
          />
        </FormField>
      </div>

      <div className="flex items-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3">
        <TrendingDown size={13} className="flex-shrink-0 text-emerald-500" />
        <p className="text-xs text-emerald-700">
          <span className="font-semibold">{fmtNative(principalPreview, debt.currency, true)}</span>{' '}
          reduces your remaining balance.
        </p>
      </div>

      <FormField label="Note">
        <TextInput
          value={form.note}
          onChange={(value) => handleChange('note', value)}
          placeholder="e.g. Extra repayment"
        />
      </FormField>

      {errors.submit ? <p className="text-sm text-rose-500">{errors.submit}</p> : null}
    </Modal>
  );
}

function DebtsEmptyState({ onAdd }: Readonly<{ onAdd: () => void }>) {
  return (
    <EmptyState
      icon={Banknote}
      title="No debts recorded"
      description="Track student loans, credit cards, personal loans, car loans, overdrafts, and other liabilities to see their impact on net worth."
      action={{
        label: 'Add your first debt',
        onClick: onAdd,
        className: 'bg-rose-600 hover:bg-rose-700',
      }}
    />
  );
}

export function Debts() {
  const { data: debts = [], isLoading: loadingDebts } = useDebts();
  const { data: payments = [], isLoading: loadingPayments } = useDebtPayments();
  const createDebt = useCreateDebt();
  const updateDebt = useUpdateDebt();
  const deleteDebt = useDeleteDebt();
  const createDebtPayment = useCreateDebtPayment();
  const deleteDebtPayment = useDeleteDebtPayment();

  const [expandedDebtId, setExpandedDebtId] = useState<number | null>(null);
  const [filter, setFilter] = useState<DebtFilterValue>('all');
  const [debtModalOpen, setDebtModalOpen] = useState(false);
  const [editingDebt, setEditingDebt] = useState<Debt | null>(null);
  const [paymentDebt, setPaymentDebt] = useState<Debt | null>(null);

  const paymentsByDebtId = useMemo(() => {
    const grouped = new Map<number, DebtPayment[]>();
    for (const payment of payments) {
      const bucket = grouped.get(payment.debtId);
      if (bucket) bucket.push(payment);
      else grouped.set(payment.debtId, [payment]);
    }
    return grouped;
  }, [payments]);

  const filteredDebts = useMemo(
    () => (filter === 'all' ? debts : debts.filter((debt) => debt.type === filter)),
    [debts, filter],
  );

  const isLoading = loadingDebts || loadingPayments;

  const openAddDebtModal = () => {
    setEditingDebt(null);
    setDebtModalOpen(true);
  };

  const openEditDebtModal = (debt: Debt) => {
    setEditingDebt(debt);
    setDebtModalOpen(true);
  };

  const handleSaveDebt = async (payload: CreateDebtPayload, debtId?: number) => {
    if (debtId != null) {
      await updateDebt.mutateAsync({ id: debtId, ...payload });
      return;
    }

    await createDebt.mutateAsync(payload);
  };

  const handleDeleteDebt = (debtId: number) => {
    if (expandedDebtId === debtId) setExpandedDebtId(null);
    deleteDebt.mutate(debtId);
  };

  const handleDeletePayment = (paymentId: number) => {
    deleteDebtPayment.mutate(paymentId);
  };

  const handleCreatePayment = async (payload: CreateDebtPaymentPayload) => {
    await createDebtPayment.mutateAsync(payload);
  };

  if (isLoading) return <LoadingState compact />;

  return (
    <PageStack>
      {debts.length > 0 ? (
        <ContentSection>
          <SummaryBanner debts={debts} />
        </ContentSection>
      ) : null}

      <ContentSection spacing="lg">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Debts & Liabilities</h1>
            <p className="mt-1 text-sm text-slate-400">
              Loans, credit cards, overdrafts, and other non-mortgage obligations.
            </p>
          </div>
          <Button
            onClick={openAddDebtModal}
            className="bg-rose-600 hover:bg-rose-700"
            leadingIcon={<Plus size={15} />}
          >
            Add Debt
          </Button>
        </div>

        {debts.length > 0 ? (
          <FilterPills debts={debts} value={filter} onChange={setFilter} />
        ) : null}

        {debts.length === 0 ? (
          <DebtsEmptyState onAdd={openAddDebtModal} />
        ) : filteredDebts.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 px-6 py-12 text-center text-sm text-slate-400">
            No debts match this filter.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            {filteredDebts.map((debt) => (
              <DebtCard
                key={debt.id}
                debt={debt}
                payments={paymentsByDebtId.get(debt.id) ?? []}
                expanded={expandedDebtId === debt.id}
                onToggle={() =>
                  setExpandedDebtId((current) => (current === debt.id ? null : debt.id))
                }
                onEdit={() => openEditDebtModal(debt)}
                onDelete={() => handleDeleteDebt(debt.id)}
                onLogPayment={() => setPaymentDebt(debt)}
                onDeletePayment={handleDeletePayment}
              />
            ))}
          </div>
        )}

        {debts.length > 0 ? (
          <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4">
            <Info size={14} className="mt-0.5 flex-shrink-0 text-slate-400" />
            <p className="text-xs leading-relaxed text-slate-500">
              Outstanding debt balances are subtracted from your total assets on the dashboard to
              calculate <span className="font-semibold text-slate-700">net worth</span>. Payoff
              projections use standard amortisation and assume a constant monthly payment.
            </p>
          </div>
        ) : null}
      </ContentSection>

      {debtModalOpen ? (
        <DebtFormModal
          debt={editingDebt}
          onClose={() => {
            setDebtModalOpen(false);
            setEditingDebt(null);
          }}
          onSubmit={handleSaveDebt}
        />
      ) : null}

      {paymentDebt ? (
        <DebtPaymentModal
          debt={paymentDebt}
          onClose={() => setPaymentDebt(null)}
          onSubmit={handleCreatePayment}
        />
      ) : null}
    </PageStack>
  );
}
