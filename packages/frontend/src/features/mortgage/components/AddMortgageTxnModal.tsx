import {
  Modal,
  ModalFooter,
  ModalHeader,
  CurrencyInput,
  TextInput,
  FormField,
  TxnTypeSelector,
  DateNoteRow,
} from '@/components/ui';
import { useCurrency } from '@/lib/CurrencyContext';
import {
  monthlyInterest,
  type Mortgage as MortgageType,
  type MortgageTransaction,
  formatPercent,
  DEFAULT_EMOJI,
} from '@quro/shared';
import { useMortgageTxnModal } from '../hooks';
import type { MortgageTxnType, SaveMortgageTxnInput } from '../types';
import { MORTGAGE_TXN_TYPES, TXN_META } from '../utils/mortgage-meta';

type AddMortgageTxnModalProps = {
  mortgage: MortgageType;
  existing?: MortgageTransaction;
  onClose: () => void;
  onSave: (t: SaveMortgageTxnInput) => void;
};

// When editing a repayment, the mortgage balance already reflects the old
// transaction's principal. Add it back so the live preview reflects the balance
// before the edited repayment is applied.
function buildEffectiveMortgage(
  mortgage: MortgageType,
  existing?: MortgageTransaction,
): MortgageType {
  if (existing?.type !== 'repayment') return mortgage;
  const existingPrincipal =
    existing.principal ?? Math.max(0, existing.amount - (existing.interest ?? 0));
  return { ...mortgage, outstandingBalance: mortgage.outstandingBalance + existingPrincipal };
}

const TXN_TYPES = MORTGAGE_TXN_TYPES.map((key) => ({ key, ...TXN_META[key] }));

// ─── Context Info Pill ────────────────────────────────────────────────────────

type ContextPillProps = {
  type: MortgageTxnType;
  mortgage: MortgageType;
  fmt: (n: number) => string;
};

function ContextPill({ type, mortgage, fmt }: ContextPillProps) {
  return (
    <div className="flex items-center gap-3 bg-surface-sunken rounded-xl px-4 py-2.5 text-xs text-fg-muted">
      {type === 'repayment' && (
        <>
          <span>Current balance</span>
          <span className="text-fg-disabled">·</span>
          <span className="font-semibold text-fg-emphasis">{fmt(mortgage.outstandingBalance)}</span>
        </>
      )}
      {type === 'valuation' && (
        <>
          <span>Current value</span>
          <span className="text-fg-disabled">·</span>
          <span className="font-semibold text-fg-emphasis">{fmt(mortgage.propertyValue)}</span>
        </>
      )}
      {type === 'rate_change' && (
        <>
          <span>Current rate</span>
          <span className="text-fg-disabled">·</span>
          <span className="font-semibold text-fg-emphasis">{mortgage.interestRate}%</span>
        </>
      )}
    </div>
  );
}

// ─── Live Preview ─────────────────────────────────────────────────────────────

type LivePreviewProps = {
  type: MortgageTxnType;
  parsedAmount: number;
  parsedInterest: number;
  derivedPrincipal: number;
  computedFixedUntil: string | null;
  mortgage: MortgageType;
  fmt: (n: number) => string;
};

function RepaymentPreview({
  parsedAmount,
  parsedInterest,
  derivedPrincipal,
  mortgage,
  fmt,
}: Omit<LivePreviewProps, 'type' | 'computedFixedUntil'>) {
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-xs">
        <span className="text-fg-muted">Total payment</span>
        <span className="font-semibold text-fg-emphasis">{fmt(parsedAmount)}</span>
      </div>
      <div className="flex justify-between text-xs">
        <span className="text-fg-muted">Interest (cost)</span>
        <span className="font-semibold text-danger">{fmt(parsedInterest)}</span>
      </div>
      <div className="flex justify-between text-xs">
        <span className="text-fg-muted">Principal (reduces balance)</span>
        <span className="font-semibold text-brand">−{fmt(derivedPrincipal)}</span>
      </div>
      <div className="flex justify-between text-xs border-t border-brand-soft-strong pt-1.5 mt-1">
        <span className="text-fg-muted">New balance</span>
        <span className="font-semibold text-fg-emphasis">
          {fmt(Math.max(0, mortgage.outstandingBalance - derivedPrincipal))}
        </span>
      </div>
    </div>
  );
}

function ValuationPreview({
  parsedAmount,
  mortgage,
  fmt,
}: Pick<LivePreviewProps, 'parsedAmount' | 'mortgage' | 'fmt'>) {
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-xs">
        <span className="text-fg-muted">Previous value</span>
        <span className="font-semibold text-fg-emphasis">{fmt(mortgage.propertyValue)}</span>
      </div>
      <div className="flex justify-between text-xs">
        <span className="text-fg-muted">New value</span>
        <span
          className={`font-semibold ${parsedAmount >= mortgage.propertyValue ? 'text-success' : 'text-danger'}`}
        >
          {fmt(parsedAmount)}
        </span>
      </div>
      <div className="flex justify-between text-xs">
        <span className="text-fg-muted">Change</span>
        <span
          className={`font-semibold ${parsedAmount >= mortgage.propertyValue ? 'text-success' : 'text-danger'}`}
        >
          {parsedAmount >= mortgage.propertyValue ? '+' : ''}
          {fmt(parsedAmount - mortgage.propertyValue)}
        </span>
      </div>
      <div className="flex justify-between text-xs border-t border-success-soft-strong pt-1.5 mt-1">
        <span className="text-fg-muted">New LTV</span>
        <span className="font-semibold text-fg-emphasis">
          {formatPercent((mortgage.outstandingBalance / parsedAmount) * 100, 1)}
        </span>
      </div>
    </div>
  );
}

function RateChangePreview({
  parsedAmount,
  computedFixedUntil,
  mortgage,
  fmt,
}: Pick<LivePreviewProps, 'parsedAmount' | 'computedFixedUntil' | 'mortgage' | 'fmt'>) {
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-xs">
        <span className="text-fg-muted">Previous rate</span>
        <span className="font-semibold text-fg-emphasis">{mortgage.interestRate}%</span>
      </div>
      <div className="flex justify-between text-xs">
        <span className="text-fg-muted">New rate</span>
        <span
          className={`font-semibold ${parsedAmount <= mortgage.interestRate ? 'text-success' : 'text-danger'}`}
        >
          {parsedAmount}%
        </span>
      </div>
      <div className="flex justify-between text-xs">
        <span className="text-fg-muted">Monthly interest est.</span>
        <span className="font-semibold text-fg-emphasis">
          {fmt(monthlyInterest(mortgage.outstandingBalance, parsedAmount))}
        </span>
      </div>
      {computedFixedUntil && (
        <div className="flex justify-between text-xs border-t border-warning-soft-strong pt-1.5 mt-1">
          <span className="text-fg-muted">Fixed until</span>
          <span className="font-semibold text-warning">{computedFixedUntil}</span>
        </div>
      )}
    </div>
  );
}

function LivePreview(props: LivePreviewProps) {
  const { type, parsedAmount } = props;
  if (parsedAmount <= 0) return null;
  const bgClass =
    type === 'valuation'
      ? 'bg-success-soft border-success-soft-strong'
      : type === 'rate_change'
        ? 'bg-warning-soft border-warning-soft-strong'
        : 'bg-brand-soft border-brand-soft-strong';
  return (
    <div className={`rounded-xl p-4 border ${bgClass}`}>
      {type === 'repayment' && <RepaymentPreview {...props} />}
      {type === 'valuation' && <ValuationPreview {...props} />}
      {type === 'rate_change' && <RateChangePreview {...props} />}
    </div>
  );
}

type TxnModalState = ReturnType<typeof useMortgageTxnModal>;

// ─── Form Sub-components ──────────────────────────────────────────────────────

type TxnAmountFieldProps = {
  type: MortgageTxnType;
  error: string;
  amount: string;
  mortgage: MortgageType;
  setAmount: (v: string) => void;
  setError: (v: string) => void;
};
function TxnAmountField({
  type,
  error,
  amount,
  mortgage,
  setAmount,
  setError,
}: TxnAmountFieldProps) {
  const labels = {
    repayment: `Total Repayment Amount (${mortgage.currency})`,
    valuation: `New Estimated Value (${mortgage.currency})`,
    rate_change: 'New Interest Rate (%)',
  };
  return (
    <FormField label={labels[type]}>
      <CurrencyInput
        currency={type === 'rate_change' ? '%' : mortgage.currency}
        value={amount}
        error={Boolean(error)}
        placeholder={type === 'rate_change' ? '4.25' : '0.00'}
        onChange={(value) => {
          setAmount(value);
          setError('');
        }}
      />
    </FormField>
  );
}

type RateChangeFieldsProps = {
  error: string;
  parsedFixedYears: number;
  fixedYears: string;
  computedFixedUntil: string | null;
  setFixedYears: (v: string) => void;
  setError: (v: string) => void;
};
function RateChangeFields({
  error,
  parsedFixedYears,
  fixedYears,
  computedFixedUntil,
  setFixedYears,
  setError,
}: RateChangeFieldsProps) {
  return (
    <FormField label="Fixed Period" hint="— how long is this rate fixed for?">
      <div className="relative">
        <TextInput
          type="number"
          step="0.5"
          min="0.5"
          max="30"
          className="pl-4 pr-16"
          error={Boolean(error && parsedFixedYears <= 0)}
          placeholder="e.g. 2"
          value={fixedYears}
          onChange={(value) => {
            setFixedYears(value);
            setError('');
          }}
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-fg-faint text-xs font-medium">
          years
        </span>
      </div>
      {computedFixedUntil && (
        <p className="mt-1.5 text-xs text-fg-subtle">
          Fixed until <span className="font-semibold text-warning">{computedFixedUntil}</span>
        </p>
      )}
    </FormField>
  );
}

type RepaymentInterestFieldProps = {
  error: string;
  parsedInterest: number;
  parsedAmount: number;
  derivedPrincipal: number;
  interest: string;
  mortgage: MortgageType;
  fmt: (n: number) => string;
  setInterest: (v: string) => void;
  setError: (v: string) => void;
};
function RepaymentInterestField({
  error,
  parsedInterest,
  parsedAmount,
  derivedPrincipal,
  interest,
  mortgage,
  fmt,
  setInterest,
  setError,
}: RepaymentInterestFieldProps) {
  return (
    <FormField
      label={`Interest Portion (${mortgage.currency})`}
      hint="— principal is auto-calculated"
    >
      <CurrencyInput
        currency={mortgage.currency}
        value={interest}
        error={Boolean(error && parsedInterest > parsedAmount)}
        onChange={(value) => {
          setInterest(value);
          setError('');
        }}
      />
      <div className="mt-2 flex gap-4 text-xs text-fg-subtle">
        <span>
          Interest: <span className="font-semibold text-danger">{fmt(parsedInterest)}</span>
        </span>
        <span>
          Principal: <span className="font-semibold text-brand">{fmt(derivedPrincipal)}</span>
        </span>
      </div>
    </FormField>
  );
}

type TxnModalFormBodyProps = {
  state: TxnModalState;
  mortgage: MortgageType;
  fmt: (n: number) => string;
};
function TxnConditionalFields({ state, mortgage, fmt }: TxnModalFormBodyProps) {
  const { type, error, parsedFixedYears, fixedYears, computedFixedUntil, setFixedYears, setError } =
    state;
  const { parsedInterest, parsedAmount, derivedPrincipal, interest, setInterest } = state;
  return (
    <>
      {type === 'rate_change' && (
        <RateChangeFields
          error={error}
          parsedFixedYears={parsedFixedYears}
          fixedYears={fixedYears}
          computedFixedUntil={computedFixedUntil}
          setFixedYears={setFixedYears}
          setError={setError}
        />
      )}
      {type === 'repayment' && (
        <RepaymentInterestField
          error={error}
          parsedInterest={parsedInterest}
          parsedAmount={parsedAmount}
          derivedPrincipal={derivedPrincipal}
          interest={interest}
          mortgage={mortgage}
          fmt={fmt}
          setInterest={setInterest}
          setError={setError}
        />
      )}
    </>
  );
}

function TxnModalFormBody({ state, mortgage, fmt }: TxnModalFormBodyProps) {
  return (
    <div className="p-6 space-y-5">
      <FormField label="Transaction Type" labelClassName="mb-2">
        <TxnTypeSelector types={TXN_TYPES} value={state.type} onChange={state.handleTypeChange} />
      </FormField>
      <ContextPill type={state.type} mortgage={mortgage} fmt={fmt} />
      <TxnAmountField
        type={state.type}
        error={state.error}
        amount={state.amount}
        mortgage={mortgage}
        setAmount={state.setAmount}
        setError={state.setError}
      />
      <TxnConditionalFields state={state} mortgage={mortgage} fmt={fmt} />
      {state.error && <p className="text-xs text-danger">{state.error}</p>}
      <DateNoteRow
        date={state.date}
        note={state.note}
        onDateChange={state.setDate}
        onNoteChange={state.setNote}
        notePlaceholder="e.g. Monthly repayment…"
      />
      <LivePreview
        type={state.type}
        parsedAmount={state.parsedAmount}
        parsedInterest={state.parsedInterest}
        derivedPrincipal={state.derivedPrincipal}
        computedFixedUntil={state.computedFixedUntil}
        mortgage={mortgage}
        fmt={fmt}
      />
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function AddMortgageTxnModal({
  mortgage,
  existing,
  onClose,
  onSave,
}: AddMortgageTxnModalProps) {
  const { fmtBase } = useCurrency();
  const fmt = (v: number) => fmtBase(v);
  const effectiveMortgage = buildEffectiveMortgage(mortgage, existing);
  const state = useMortgageTxnModal({ mortgage: effectiveMortgage, existing, onSave, onClose });
  const isEditing = Boolean(existing);
  const title = isEditing ? 'Edit Transaction' : 'Record Transaction';

  return (
    <Modal
      title={title}
      subtitle={`${DEFAULT_EMOJI.property} ${mortgage.propertyAddress}`}
      onClose={onClose}
      maxWidth="md"
      bodyClassName="p-0 space-y-0"
      header={
        <ModalHeader
          onClose={onClose}
          title={title}
          subtitle={`${DEFAULT_EMOJI.property} ${mortgage.propertyAddress}`}
          contentClassName="min-w-0"
          subtitleClassName="truncate max-w-[240px]"
        />
      }
      footer={
        <ModalFooter
          onCancel={onClose}
          onConfirm={state.handleSave}
          confirmLabel={isEditing ? 'Save Changes' : 'Record'}
        />
      }
    >
      <TxnModalFormBody state={state} mortgage={effectiveMortgage} fmt={fmt} />
    </Modal>
  );
}
