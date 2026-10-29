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
  /** The mortgage's ledger, for the suggested repayment. */
  transactions: readonly MortgageTransaction[];
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
    <div className="flex items-center gap-2 rounded-md bg-surface-sunken px-3 py-2 text-cell text-fg-muted">
      {type === 'repayment' && (
        <>
          <span>Current balance</span>
          <span className="text-fg-faint">·</span>
          <span className="font-medium font-numeric text-fg">
            {fmt(mortgage.outstandingBalance)}
          </span>
        </>
      )}
      {type === 'rate_change' && (
        <>
          <span>Current rate</span>
          <span className="text-fg-faint">·</span>
          <span className="font-medium font-numeric text-fg">{mortgage.interestRate}%</span>
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
      <div className="flex justify-between gap-3 text-cell">
        <span className="text-fg-muted">Total payment</span>
        <span className="font-medium font-numeric text-fg">{fmt(parsedAmount)}</span>
      </div>
      <div className="flex justify-between gap-3 text-cell">
        <span className="text-fg-muted">Interest (cost)</span>
        <span className="font-medium font-numeric text-fg">{fmt(parsedInterest)}</span>
      </div>
      <div className="flex justify-between gap-3 text-cell">
        <span className="text-fg-muted">Principal (reduces balance)</span>
        <span className="font-medium font-numeric text-fg">
          {'\u2212'}
          {fmt(derivedPrincipal)}
        </span>
      </div>
      <div className="mt-1 flex justify-between gap-3 border-t border-border-strong pt-1.5 text-cell">
        <span className="text-fg-muted">New balance</span>
        <span className="font-medium font-numeric text-fg">
          {fmt(Math.max(0, mortgage.outstandingBalance - derivedPrincipal))}
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
      <div className="flex justify-between gap-3 text-cell">
        <span className="text-fg-muted">Previous rate</span>
        <span className="font-medium font-numeric text-fg">{mortgage.interestRate}%</span>
      </div>
      <div className="flex justify-between gap-3 text-cell">
        <span className="text-fg-muted">New rate</span>
        <span className="font-medium font-numeric text-fg">{parsedAmount}%</span>
      </div>
      <div className="flex justify-between gap-3 text-cell">
        <span className="text-fg-muted">Monthly interest est.</span>
        <span className="font-medium font-numeric text-fg">
          {fmt(monthlyInterest(mortgage.outstandingBalance, parsedAmount))}
        </span>
      </div>
      {computedFixedUntil && (
        <div className="mt-1 flex justify-between gap-3 border-t border-border-strong pt-1.5 text-cell">
          <span className="text-fg-muted">Fixed until</span>
          <span className="font-medium text-fg">{computedFixedUntil}</span>
        </div>
      )}
    </div>
  );
}

function LivePreview(props: LivePreviewProps) {
  const { type, parsedAmount } = props;
  if (parsedAmount <= 0) return null;
  return (
    <div className="rounded-lg border border-border-default bg-surface-sunken p-3">
      {type === 'repayment' && <RepaymentPreview {...props} />}
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
    repayment: `Total repayment amount (${mortgage.currency})`,
    rate_change: 'New interest rate (%)',
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
    <FormField label="Fixed period" hint="— how long is this rate fixed for?">
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
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-caption text-fg-subtle">
          years
        </span>
      </div>
      {computedFixedUntil && (
        <p className="mt-1 text-caption text-fg-subtle">
          Fixed until <span className="font-medium text-fg">{computedFixedUntil}</span>
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
      label={`Interest portion (${mortgage.currency})`}
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
      <div className="mt-1 flex gap-4 text-caption text-fg-subtle font-numeric">
        <span>
          Interest: <span className="font-medium text-fg">{fmt(parsedInterest)}</span>
        </span>
        <span>
          Principal: <span className="font-medium text-fg">{fmt(derivedPrincipal)}</span>
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

// A new repayment is pre-filled from the loan type and rate; this says so and undoes the user's
// changes. The fields stay editable.
function SuggestionHint({
  state,
  repaymentType,
}: Readonly<{ state: TxnModalState; repaymentType: MortgageType['repaymentType'] }>) {
  const { numberFormat } = useCurrency();
  if (!state.suggestion) return null;
  return (
    <p className="flex flex-wrap items-center gap-x-2 text-caption text-fg-subtle">
      <span>
        Suggested from{' '}
        <span className="font-numeric text-fg">
          {formatPercent(state.suggestion.rate, numberFormat, 2)}
        </span>
        , {repaymentType}
      </span>
      {state.canResetSuggestion && (
        <button
          type="button"
          onClick={state.resetSuggestion}
          className="inline-flex min-h-7 items-center rounded-sm text-label text-brand-fg underline-offset-2 hover:underline max-sm:min-h-11 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus-ring"
        >
          Reset to suggestion
        </button>
      )}
    </p>
  );
}

function TxnModalFormBody({ state, mortgage, fmt }: TxnModalFormBodyProps) {
  return (
    <div className="space-y-4 p-4">
      <FormField label="Transaction type" labelClassName="mb-2">
        <TxnTypeSelector types={TXN_TYPES} value={state.type} onChange={state.handleTypeChange} />
      </FormField>
      <ContextPill type={state.type} mortgage={mortgage} fmt={fmt} />
      <SuggestionHint state={state} repaymentType={mortgage.repaymentType} />
      <TxnAmountField
        type={state.type}
        error={state.error}
        amount={state.amount}
        mortgage={mortgage}
        setAmount={state.setAmount}
        setError={state.setError}
      />
      <TxnConditionalFields state={state} mortgage={mortgage} fmt={fmt} />
      {state.error && <p className="text-caption text-danger">{state.error}</p>}
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
  transactions,
  existing,
  onClose,
  onSave,
}: AddMortgageTxnModalProps) {
  const { fmtBase } = useCurrency();
  const fmt = (v: number) => fmtBase(v);
  const effectiveMortgage = buildEffectiveMortgage(mortgage, existing);
  const state = useMortgageTxnModal({
    mortgage: effectiveMortgage,
    transactions,
    existing,
    onSave,
    onClose,
  });
  const subtitle = `${DEFAULT_EMOJI.property} ${mortgage.propertyAddress ?? mortgage.lender}`;
  const isEditing = Boolean(existing);
  const title = isEditing ? 'Edit transaction' : 'Record transaction';

  return (
    <Modal
      title={title}
      subtitle={subtitle}
      onClose={onClose}
      maxWidth="md"
      bodyClassName="p-0 space-y-0"
      header={
        <ModalHeader
          onClose={onClose}
          title={title}
          subtitle={subtitle}
          contentClassName="min-w-0"
          subtitleClassName="truncate max-w-[240px]"
        />
      }
      footer={
        <ModalFooter
          onCancel={onClose}
          onConfirm={state.handleSave}
          confirmLabel={isEditing ? 'Save changes' : 'Record'}
        />
      }
    >
      <TxnModalFormBody state={state} mortgage={effectiveMortgage} fmt={fmt} />
    </Modal>
  );
}
