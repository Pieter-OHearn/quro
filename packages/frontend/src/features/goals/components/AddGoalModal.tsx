import { useId } from 'react';
import { CATEGORY_COLOR_NAMES, categoryColorFor, dataColorToken } from '@/lib/dataColors';
import { cn } from '@/lib/utils';
import { Link2 } from 'lucide-react';
import {
  Badge,
  FormField,
  Modal,
  ModalFooter,
  SelectInput,
  Textarea,
  TextInput,
  DateInput,
  MonthInput,
  CurrencyInput,
  EmojiPickerField,
} from '@/components/ui';
import {
  getMonthAbbreviationIndex,
  MONTH_ABBREVIATIONS,
  type GoalType,
  type SavingsAccount,
} from '@quro/shared';
import { useCurrency } from '@/lib/CurrencyContext';
import { useAddGoalModal } from '../hooks';
import { COLORS, GOAL_CHIP_CLASS_NAME, GOAL_TYPE_META } from '../utils/goals-constants';
import type {
  AddGoalModalProps,
  FilterKey,
  GoalFormField,
  GoalFormState,
  GoalMeta,
} from '../types';

type SetField = (key: GoalFormField, value: string) => void;

const HINT_CLASS_NAME = 'mt-1 flex items-center gap-1 text-caption text-fg-subtle';
const LINKED_BOX_CLASS_NAME = 'rounded-md border border-border-default bg-surface-sunken px-3 py-2';

function dateStringToDeadline(dateStr: string): string {
  if (!dateStr) return '';
  const date = new Date(dateStr + 'T00:00:00Z');
  const month = MONTH_ABBREVIATIONS[date.getUTCMonth()];
  const year = date.getUTCFullYear();
  return `${month} ${year}`;
}

function deadlineToDateString(deadline: string): string {
  if (!deadline) return '';
  const match = deadline.match(/^([A-Za-z]+)\s+(\d{4})$/);
  if (!match) return '';
  const monthStr = match[1];
  const year = match[2];
  const month = getMonthAbbreviationIndex(monthStr);
  if (month === -1) return '';
  const monthPad = String(month + 1).padStart(2, '0');
  return `${year}-${monthPad}-01`;
}

function monthsBetween(startDeadline: string, endDeadline: string): number {
  const parseDeadline = (d: string) => {
    const m = d.match(/^([A-Za-z]+)\s+(\d{4})$/);
    if (!m) return null;
    const mo = getMonthAbbreviationIndex(m[1]);
    return mo === -1 ? null : { year: Number(m[2]), month: mo };
  };
  const s = parseDeadline(startDeadline);
  const e = parseDeadline(endDeadline);
  if (!s || !e) return 0;
  return Math.max(0, (e.year - s.year) * 12 + (e.month - s.month) + 1);
}

type AmountFieldsSavingsPortfolioProps = {
  type: GoalType;
  form: GoalFormState;
  setField: SetField;
  savingsAccounts: readonly SavingsAccount[];
  loadingSavingsAccounts: boolean;
  baseCurrency: string;
  convertToBase: (amount: number, fromCurrency: string) => number;
  fmtBase: (amount: number, fromCurrency?: string, decimals?: boolean) => string;
};

const buildSavingsSourceOptions = (
  savingsAccounts: readonly SavingsAccount[],
  fmtBase: AmountFieldsSavingsPortfolioProps['fmtBase'],
) => [
  { value: '', label: 'Manual current amount' },
  ...savingsAccounts.map((account) => ({
    value: String(account.id),
    label: `${account.emoji} ${account.name} - ${fmtBase(account.balance, account.currency)}`,
  })),
];

function SavingsSourceSelector({
  form,
  setField,
  savingsAccounts,
  loadingSavingsAccounts,
  selectedSource,
  convertToBase,
  fmtBase,
  baseCurrency,
}: Readonly<
  Omit<AmountFieldsSavingsPortfolioProps, 'type'> & {
    selectedSource: SavingsAccount | undefined;
  }
>) {
  const sourceOptions = buildSavingsSourceOptions(savingsAccounts, fmtBase);

  return (
    <FormField label="Progress source" hint="optional" className="col-span-2">
      <SelectInput
        value={form.sourceId}
        options={sourceOptions}
        disabled={loadingSavingsAccounts || savingsAccounts.length === 0}
        onChange={(value) => {
          setField('sourceId', value);
          const account = savingsAccounts.find((item) => String(item.id) === value);
          setField(
            'current',
            account ? String(convertToBase(account.balance, account.currency)) : '',
          );
          setField('currency', account ? account.currency : baseCurrency);
        }}
      />
      <p className={HINT_CLASS_NAME}>
        <Link2 size={12} aria-hidden />
        {selectedSource
          ? `Progress will use ${selectedSource.name}'s latest balance.`
          : 'Leave manual if you want to type progress yourself.'}
      </p>
    </FormField>
  );
}

function LinkedCurrentAmountSummary({
  selectedSource,
  fmtNative,
}: Readonly<{
  selectedSource: SavingsAccount;
  fmtNative: (amount: number, currency: string) => string;
}>) {
  return (
    <div className={LINKED_BOX_CLASS_NAME}>
      <p className="text-label text-fg-muted">Linked current amount</p>
      <p className="mt-0.5 text-figure-md font-numeric text-fg">
        {fmtNative(selectedSource.balance, selectedSource.currency)}
      </p>
    </div>
  );
}

function ManualCurrentAmountField({
  form,
  setField,
  baseCurrency,
}: Readonly<Pick<AmountFieldsSavingsPortfolioProps, 'form' | 'setField' | 'baseCurrency'>>) {
  return (
    <FormField label="Current amount">
      <CurrencyInput
        currency={baseCurrency}
        inputMode="decimal"
        step="0.01"
        placeholder="0.00"
        value={form.current}
        onChange={(value) => setField('current', value)}
      />
    </FormField>
  );
}

function TargetAmountField({
  form,
  setField,
  baseCurrency,
}: Readonly<Pick<AmountFieldsSavingsPortfolioProps, 'form' | 'setField' | 'baseCurrency'>>) {
  return (
    <FormField label="Target amount" required>
      <CurrencyInput
        currency={baseCurrency}
        inputMode="decimal"
        step="0.01"
        placeholder="15000.00"
        value={form.target}
        onChange={(value) => setField('target', value)}
      />
    </FormField>
  );
}

function MonthlyContributionField({
  form,
  setField,
  baseCurrency,
}: Readonly<
  Pick<AmountFieldsSavingsPortfolioProps, 'form' | 'setField'> & { baseCurrency: string }
>) {
  return (
    <FormField label={`Monthly contribution (${baseCurrency})`}>
      <CurrencyInput
        currency={baseCurrency}
        inputMode="decimal"
        step="0.01"
        placeholder="500.00"
        value={form.monthlyContrib}
        onChange={(value) => setField('monthlyContrib', value)}
      />
    </FormField>
  );
}

function AutoLinkedSourceSummary({
  label,
  description,
  currentValue,
  fmtBase,
}: Readonly<{
  label: string;
  description: string;
  currentValue: number;
  fmtBase: AmountFieldsSavingsPortfolioProps['fmtBase'];
}>) {
  return (
    <div className={cn('col-span-2', LINKED_BOX_CLASS_NAME)}>
      <p className="text-label text-fg-muted">{label}</p>
      <p className="mt-0.5 text-figure-md font-numeric text-fg">{fmtBase(currentValue)}</p>
      <p className={HINT_CLASS_NAME}>
        <Link2 size={12} aria-hidden /> {description}
      </p>
    </div>
  );
}

function DeadlineField({ form, setField }: Readonly<{ form: GoalFormState; setField: SetField }>) {
  const handleDateChange = (dateStr: string) => {
    if (!dateStr) return;
    const deadline = dateStringToDeadline(dateStr);
    const year = dateStr.split('-')[0];
    setField('deadline', deadline);
    setField('year', year);
  };
  return (
    <FormField label="Deadline">
      <DateInput value={deadlineToDateString(form.deadline)} onChange={handleDateChange} />
    </FormField>
  );
}

function AmountFieldsSavingsPortfolio(
  props: Readonly<AmountFieldsSavingsPortfolioProps & { portfolioTotal: number; netWorth: number }>,
) {
  const { type, form, setField, savingsAccounts, fmtBase, baseCurrency, portfolioTotal, netWorth } =
    props;
  const { fmtNative } = useCurrency();
  const accountCurrency = form.currency || baseCurrency;
  const selectedSource =
    type === 'savings'
      ? savingsAccounts.find((account) => String(account.id) === form.sourceId)
      : undefined;

  const isPortfolioOrNetWorth = type === 'portfolio' || type === 'net_worth';

  return (
    <div className="grid grid-cols-2 gap-3">
      {type === 'savings' && <SavingsSourceSelector {...props} selectedSource={selectedSource} />}
      {type === 'portfolio' && (
        <AutoLinkedSourceSummary
          label="Linked portfolio value"
          description="Auto-linked from your investments page."
          currentValue={portfolioTotal}
          fmtBase={fmtBase}
        />
      )}
      {type === 'net_worth' && (
        <AutoLinkedSourceSummary
          label="Linked net worth"
          description="Auto-linked from your dashboard."
          currentValue={netWorth}
          fmtBase={fmtBase}
        />
      )}
      {type === 'savings' &&
        (selectedSource ? (
          <LinkedCurrentAmountSummary selectedSource={selectedSource} fmtNative={fmtNative} />
        ) : (
          <ManualCurrentAmountField
            form={form}
            setField={setField}
            baseCurrency={accountCurrency}
          />
        ))}
      <TargetAmountField form={form} setField={setField} baseCurrency={accountCurrency} />
      {isPortfolioOrNetWorth && <DeadlineField form={form} setField={setField} />}
    </div>
  );
}

function AmountFieldsSalary({
  form,
  setField,
  baseCurrency,
}: Readonly<{ form: GoalFormState; setField: SetField; baseCurrency: string }>) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <FormField label="Target annual gross" required>
        <CurrencyInput
          currency={baseCurrency}
          inputMode="decimal"
          step="0.01"
          placeholder="90000.00"
          value={form.target}
          onChange={(value) => setField('target', value)}
        />
        <p className={HINT_CLASS_NAME}>
          <Link2 size={12} aria-hidden /> Current salary auto-linked from your Salary page
        </p>
      </FormField>
      <DeadlineField form={form} setField={setField} />
    </div>
  );
}

function AmountFieldsAnnual({
  form,
  setField,
}: Readonly<{ form: GoalFormState; setField: SetField }>) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <FormField label="Current progress">
        <TextInput
          type="number"
          placeholder="0"
          value={form.current}
          onChange={(value) => setField('current', value)}
        />
      </FormField>
      <FormField label="Target" required>
        <TextInput
          type="number"
          placeholder="4"
          value={form.target}
          onChange={(value) => setField('target', value)}
        />
      </FormField>
      <FormField label="Unit label" hint="optional" className="col-span-2">
        <TextInput
          placeholder="e.g. books, %, EUR/mo"
          value={form.unit}
          onChange={(value) => setField('unit', value)}
        />
      </FormField>
    </div>
  );
}

function dateToMonthString(dateStr: string): string {
  if (!dateStr) return '';
  return dateStr.substring(0, 7);
}

function deadlineToMonthString(deadline: string): string {
  const dateStr = deadlineToDateString(deadline);
  return dateStr ? dateStr.substring(0, 7) : '';
}

function AmountFieldsInvestHabit({
  form,
  setField,
  baseCurrency,
}: Readonly<{
  form: GoalFormState;
  setField: SetField;
  baseCurrency: string;
}>) {
  const handleStartMonthChange = (monthStr: string) => {
    setField('startMonth', monthStr ? `${monthStr}-01` : '');
  };

  const handleEndMonthChange = (monthStr: string) => {
    if (!monthStr) return;
    const deadline = dateStringToDeadline(`${monthStr}-01`);
    const year = monthStr.split('-')[0];
    setField('deadline', deadline);
    setField('year', year);
  };

  const startDeadline = form.startMonth ? dateStringToDeadline(form.startMonth) : '';
  const rangeMonths =
    startDeadline && form.deadline ? monthsBetween(startDeadline, form.deadline) : 0;

  return (
    <div className="grid grid-cols-2 gap-3">
      <FormField label={`Monthly target (${baseCurrency})`} required className="col-span-2">
        <CurrencyInput
          currency={baseCurrency}
          inputMode="decimal"
          step="0.01"
          placeholder="500.00"
          value={form.monthlyTarget}
          onChange={(value) => setField('monthlyTarget', value)}
        />
      </FormField>
      <FormField label="Start month">
        <MonthInput value={dateToMonthString(form.startMonth)} onChange={handleStartMonthChange} />
      </FormField>
      <FormField label="End month">
        <MonthInput value={deadlineToMonthString(form.deadline)} onChange={handleEndMonthChange} />
      </FormField>
      <div className={cn('col-span-2', LINKED_BOX_CLASS_NAME)}>
        <p className="flex items-center gap-1 text-caption text-fg-subtle">
          <Link2 size={12} aria-hidden /> Monthly buy transactions auto-tracked from your
          investments.
          {rangeMonths > 0 && ` ${rangeMonths} month${rangeMonths > 1 ? 's' : ''} in range.`}
        </p>
      </div>
    </div>
  );
}

function GoalDetailsAmountFields({
  type,
  form,
  setField,
  baseCurrency,
  savingsAccounts,
  loadingSavingsAccounts,
  convertToBase,
  fmtBase,
  portfolioTotal,
  netWorth,
}: Readonly<{
  type: GoalType;
  form: GoalFormState;
  setField: SetField;
  baseCurrency: string;
  savingsAccounts: readonly SavingsAccount[];
  loadingSavingsAccounts: boolean;
  convertToBase: (amount: number, fromCurrency: string) => number;
  fmtBase: (amount: number, fromCurrency?: string, decimals?: boolean) => string;
  portfolioTotal: number;
  netWorth: number;
}>) {
  if (type === 'savings' || type === 'portfolio' || type === 'net_worth') {
    return (
      <AmountFieldsSavingsPortfolio
        type={type}
        form={form}
        setField={setField}
        savingsAccounts={savingsAccounts}
        loadingSavingsAccounts={loadingSavingsAccounts}
        convertToBase={convertToBase}
        fmtBase={fmtBase}
        baseCurrency={baseCurrency}
        portfolioTotal={portfolioTotal}
        netWorth={netWorth}
      />
    );
  }
  if (type === 'salary')
    return <AmountFieldsSalary form={form} setField={setField} baseCurrency={baseCurrency} />;
  if (type === 'invest_habit') {
    return <AmountFieldsInvestHabit form={form} setField={setField} baseCurrency={baseCurrency} />;
  }
  if (type === 'annual') return <AmountFieldsAnnual form={form} setField={setField} />;
  return null;
}

function GoalDetailsNameRow({
  form,
  setField,
}: Readonly<{ form: GoalFormState; setField: SetField }>) {
  return (
    <div className="flex gap-3 items-end">
      <EmojiPickerField
        value={form.emoji}
        onChange={(emoji) => setField('emoji', emoji)}
        pickerHeight={350}
        pickerWidth={280}
      />
      <FormField label="Goal name" required className="flex-1">
        <TextInput
          placeholder="e.g. Hit 100k salary"
          value={form.name}
          onChange={(value) => setField('name', value)}
        />
      </FormField>
    </div>
  );
}

function GoalColorPicker({
  selected,
  onSelect,
}: Readonly<{ selected: string; onSelect: (color: string) => void }>) {
  // A saved legacy colour selects the offered swatch it displays as.
  const selectedSwatch = categoryColorFor(selected);
  const labelId = useId();
  return (
    <div>
      <p id={labelId} className="mb-1.5 text-label text-fg-muted">
        Colour
      </p>
      <div className="flex flex-wrap gap-2" role="group" aria-labelledby={labelId}>
        {COLORS.map((color) => (
          <button
            key={color}
            type="button"
            onClick={() => onSelect(color)}
            aria-label={CATEGORY_COLOR_NAMES[color]}
            aria-pressed={selectedSwatch === color}
            title={CATEGORY_COLOR_NAMES[color]}
            className={cn(
              'h-6 w-6 rounded-full transition-shadow duration-fast max-sm:h-11 max-sm:w-11',
              'focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-focus-ring',
              selectedSwatch === color && 'ring-2 ring-fg ring-offset-2 ring-offset-surface',
            )}
            style={{ backgroundColor: dataColorToken(color) }}
          />
        ))}
      </div>
    </div>
  );
}

function GoalTypeStep({
  onSelect,
  filterKey,
}: Readonly<{ onSelect: (type: GoalType) => void; filterKey?: FilterKey }>) {
  const entries = (Object.entries(GOAL_TYPE_META) as [GoalType, GoalMeta][]).filter(
    ([, meta]) => !filterKey || filterKey === 'all' || meta.filterKey === filterKey,
  );
  return (
    <div className="p-4">
      <p className="mb-2 text-label text-fg-muted">Select goal type</p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {entries.map(([goalType, meta]) => {
          const { Icon } = meta;
          return (
            <button
              key={goalType}
              type="button"
              onClick={() => onSelect(goalType)}
              className="flex items-start gap-2 rounded-md border border-border-control bg-surface p-3 text-left transition-colors duration-fast hover:bg-surface-muted active:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus-ring"
            >
              <Icon size={16} className="mt-0.5 shrink-0 text-secondary" aria-hidden />
              <div>
                <p className="text-cell font-medium text-fg">{meta.label}</p>
                <p className="mt-0.5 text-caption text-fg-subtle">{meta.description}</p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function GoalDetailsStep({
  type,
  form,
  setField,
  baseCurrency,
  savingsAccounts,
  loadingSavingsAccounts,
  convertToBase,
  fmtBase,
  portfolioTotal,
  netWorth,
  onBack,
}: Readonly<{
  type: GoalType;
  form: GoalFormState;
  setField: SetField;
  baseCurrency: string;
  savingsAccounts: readonly SavingsAccount[];
  loadingSavingsAccounts: boolean;
  convertToBase: (amount: number, fromCurrency: string) => number;
  fmtBase: (amount: number, fromCurrency?: string, decimals?: boolean) => string;
  portfolioTotal: number;
  netWorth: number;
  onBack: () => void;
}>) {
  const showSeparateDeadline = type === 'savings' || type === 'annual';

  return (
    <div className="space-y-4 p-4">
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-1.5 rounded-sm text-cell text-fg-muted transition-colors duration-fast hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus-ring"
      >
        {'<- Change type'}
        <Badge size="sm" className={GOAL_CHIP_CLASS_NAME}>
          {GOAL_TYPE_META[type].label}
        </Badge>
      </button>
      <GoalDetailsNameRow form={form} setField={setField} />
      <GoalDetailsAmountFields
        type={type}
        form={form}
        setField={setField}
        baseCurrency={baseCurrency}
        savingsAccounts={savingsAccounts}
        loadingSavingsAccounts={loadingSavingsAccounts}
        convertToBase={convertToBase}
        fmtBase={fmtBase}
        portfolioTotal={portfolioTotal}
        netWorth={netWorth}
      />
      {showSeparateDeadline &&
        (type === 'savings' ? (
          <div className="grid grid-cols-2 gap-3">
            <DeadlineField form={form} setField={setField} />
            <MonthlyContributionField
              form={form}
              setField={setField}
              baseCurrency={form.currency || baseCurrency}
            />
          </div>
        ) : (
          <DeadlineField form={form} setField={setField} />
        ))}
      <GoalColorPicker selected={form.color} onSelect={(color) => setField('color', color)} />
      <FormField label="Notes" hint="optional">
        <Textarea
          rows={2}
          placeholder="Any extra context..."
          value={form.notes}
          onChange={(value) => setField('notes', value)}
        />
      </FormField>
    </div>
  );
}

const SINGLE_TYPE_FROM_FILTER: Partial<Record<FilterKey, GoalType>> = {
  savings: 'savings',
  career: 'salary',
};

export function AddGoalModal({ onClose, onSave, initialFilter }: Readonly<AddGoalModalProps>) {
  const {
    baseCurrency,
    convertToBase,
    fmtBase,
    savingsAccounts,
    loadingSavingsAccounts,
    portfolioTotal,
    netWorth,
    step,
    type,
    form,
    setField,
    handleSave,
    setType,
    setStep,
    saveDisabled,
  } = useAddGoalModal(onSave, onClose);

  const singleType = initialFilter ? SINGLE_TYPE_FROM_FILTER[initialFilter] : undefined;
  const effectiveStep = singleType ? 'details' : step;
  const effectiveType = singleType ?? type;

  const subtitle =
    effectiveStep === 'type'
      ? 'Choose a goal type to get started'
      : `${GOAL_TYPE_META[effectiveType].label} - fill in the details`;

  const handleTypeSelect = (selectedType: GoalType) => {
    setType(selectedType);
    if (selectedType !== 'savings') setField('sourceId', '');
    setStep('details');
  };

  const filterKey = !singleType && initialFilter !== 'all' ? initialFilter : undefined;

  return (
    <Modal
      title="Add goal"
      subtitle={subtitle}
      onClose={onClose}
      maxWidth="lg"
      scrollable
      bodyClassName="p-0 space-y-0"
      footer={
        effectiveStep === 'details' ? (
          <ModalFooter
            onCancel={onClose}
            onConfirm={handleSave}
            confirmLabel="Save goal"
            disabled={saveDisabled}
          />
        ) : undefined
      }
    >
      {effectiveStep === 'type' ? (
        <GoalTypeStep onSelect={handleTypeSelect} filterKey={filterKey} />
      ) : (
        <GoalDetailsStep
          type={effectiveType}
          form={form}
          setField={setField}
          baseCurrency={baseCurrency}
          savingsAccounts={savingsAccounts}
          loadingSavingsAccounts={loadingSavingsAccounts}
          convertToBase={convertToBase}
          fmtBase={fmtBase}
          portfolioTotal={portfolioTotal}
          netWorth={netWorth}
          onBack={singleType ? onClose : () => setStep('type')}
        />
      )}
    </Modal>
  );
}
