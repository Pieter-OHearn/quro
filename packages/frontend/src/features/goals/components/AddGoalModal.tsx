import { Link2 } from 'lucide-react';
import {
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
import type { GoalType, SavingsAccount } from '@quro/shared';
import { useCurrency } from '@/lib/CurrencyContext';
import { useAddGoalModal } from '../hooks';
import { COLORS, GOAL_TYPE_META } from '../utils/goals-constants';
import type {
  AddGoalModalProps,
  FilterKey,
  GoalFormField,
  GoalFormState,
  GoalMeta,
} from '../types';

type SetField = (key: GoalFormField, value: string) => void;

const monthNames = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

function dateStringToDeadline(dateStr: string): string {
  if (!dateStr) return '';
  const date = new Date(dateStr + 'T00:00:00Z');
  const month = monthNames[date.getUTCMonth()];
  const year = date.getUTCFullYear();
  return `${month} ${year}`;
}

function deadlineToDateString(deadline: string): string {
  if (!deadline) return '';
  const match = deadline.match(/^([A-Za-z]+)\s+(\d{4})$/);
  if (!match) return '';
  const monthStr = match[1];
  const year = match[2];
  const month = monthNames.indexOf(monthStr);
  if (month === -1) return '';
  const monthPad = String(month + 1).padStart(2, '0');
  return `${year}-${monthPad}-01`;
}

function monthsBetween(startDeadline: string, endDeadline: string): number {
  const parseDeadline = (d: string) => {
    const m = d.match(/^([A-Za-z]+)\s+(\d{4})$/);
    if (!m) return null;
    const mo = monthNames.indexOf(m[1]);
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
    <FormField label="Progress Source" hint="optional" className="col-span-2">
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
      <p className="text-[10px] text-slate-400 mt-1.5 flex items-center gap-1">
        <Link2 size={10} />
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
    <div className="rounded-xl border border-indigo-100 bg-indigo-50/70 px-3 py-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-indigo-500">
        Linked Current Amount
      </p>
      <p className="mt-0.5 text-sm font-semibold text-slate-800">
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
    <FormField label="Current Amount">
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
    <FormField label="Target Amount" required>
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
    <FormField label={`Monthly Contribution (${baseCurrency})`}>
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
    <div className="col-span-2 rounded-xl border border-indigo-100 bg-indigo-50/70 px-3 py-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-indigo-500">{label}</p>
      <p className="mt-0.5 text-sm font-semibold text-slate-800">{fmtBase(currentValue)}</p>
      <p className="text-[10px] text-slate-400 mt-1 flex items-center gap-1">
        <Link2 size={10} /> {description}
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
          label="Linked Portfolio Value"
          description="Auto-linked from your investments page."
          currentValue={portfolioTotal}
          fmtBase={fmtBase}
        />
      )}
      {type === 'net_worth' && (
        <AutoLinkedSourceSummary
          label="Linked Net Worth"
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
      <FormField label="Target Annual Gross" required>
        <CurrencyInput
          currency={baseCurrency}
          inputMode="decimal"
          step="0.01"
          placeholder="90000.00"
          value={form.target}
          onChange={(value) => setField('target', value)}
        />
        <p className="text-[10px] text-slate-400 mt-1.5 flex items-center gap-1">
          <Link2 size={10} /> Current salary auto-linked from your Salary page
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
      <FormField label="Current Progress">
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
      <FormField label={`Monthly Target (${baseCurrency})`} required className="col-span-2">
        <CurrencyInput
          currency={baseCurrency}
          inputMode="decimal"
          step="0.01"
          placeholder="500.00"
          value={form.monthlyTarget}
          onChange={(value) => setField('monthlyTarget', value)}
        />
      </FormField>
      <FormField label="Start Month">
        <MonthInput value={dateToMonthString(form.startMonth)} onChange={handleStartMonthChange} />
      </FormField>
      <FormField label="End Month">
        <MonthInput value={deadlineToMonthString(form.deadline)} onChange={handleEndMonthChange} />
      </FormField>
      <div className="col-span-2 rounded-xl border border-indigo-100 bg-indigo-50/70 px-3 py-2.5">
        <p className="text-[10px] text-slate-400 flex items-center gap-1">
          <Link2 size={10} /> Monthly buy transactions auto-tracked from your investments.
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
      <FormField label="Goal Name" required className="flex-1">
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
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-600 mb-2">Colour</label>
      <div className="flex flex-wrap gap-2">
        {COLORS.map((color) => (
          <button
            key={color}
            type="button"
            onClick={() => onSelect(color)}
            className={`w-7 h-7 rounded-lg transition-all ${selected === color ? 'ring-2 ring-offset-2 ring-indigo-400 scale-110' : 'hover:scale-105'}`}
            style={{ backgroundColor: color }}
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
    <div className="p-6">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
        Select goal type
      </p>
      <div className="grid grid-cols-2 gap-3">
        {entries.map(([goalType, meta]) => {
          const { Icon, bg, text } = meta;
          return (
            <button
              key={goalType}
              onClick={() => onSelect(goalType)}
              className="flex items-start gap-3 p-4 rounded-2xl border-2 border-slate-100 hover:border-indigo-300 hover:bg-indigo-50/50 transition-all text-left group"
            >
              <div
                className={`w-9 h-9 rounded-xl ${bg} ${text} flex items-center justify-center flex-shrink-0 mt-0.5`}
              >
                <Icon size={16} />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-800 group-hover:text-indigo-700 leading-tight">
                  {meta.label}
                </p>
                <p className="text-[10px] text-slate-400 mt-0.5 leading-snug">{meta.description}</p>
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
    <div className="p-6 space-y-4">
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-indigo-600 transition-colors"
      >
        {'<- Change type'}
        <span
          className={`ml-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${GOAL_TYPE_META[type].bg} ${GOAL_TYPE_META[type].text}`}
        >
          {GOAL_TYPE_META[type].label}
        </span>
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
      title="Add Goal"
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
            confirmLabel="Save Goal"
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
