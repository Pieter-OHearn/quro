import { Link2 } from 'lucide-react';
import {
  FormField,
  Modal,
  ModalFooter,
  SelectInput,
  Textarea,
  TextInput,
  DateInput,
  CurrencyInput,
} from '@/components/ui';
import type { GoalType, SavingsAccount } from '@quro/shared';
import { useAddGoalModal } from '../hooks';
import { COLORS, GOAL_TYPE_META } from '../utils/goals-constants';
import type { AddGoalModalProps, GoalFormField, GoalFormState, GoalMeta } from '../types';

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

function GoalTypeStep({ onSelect }: Readonly<{ onSelect: (type: GoalType) => void }>) {
  return (
    <div className="p-6">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
        Select goal type
      </p>
      <div className="grid grid-cols-2 gap-3">
        {(Object.entries(GOAL_TYPE_META) as [GoalType, GoalMeta][]).map(([goalType, meta]) => {
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
  fmtBase,
}: Readonly<{
  selectedSource: SavingsAccount;
  fmtBase: AmountFieldsSavingsPortfolioProps['fmtBase'];
}>) {
  return (
    <div className="col-span-2 rounded-xl border border-indigo-100 bg-indigo-50/70 px-3 py-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-indigo-500">
        Linked Current Amount
      </p>
      <p className="mt-0.5 text-sm font-semibold text-slate-800">
        {fmtBase(selectedSource.balance, selectedSource.currency)}
      </p>
    </div>
  );
}

function ManualCurrentAmountField({
  form,
  setField,
}: Readonly<Pick<AmountFieldsSavingsPortfolioProps, 'form' | 'setField'>>) {
  return (
    <FormField label="Current Amount">
      <TextInput
        type="number"
        inputMode="decimal"
        step="0.01"
        placeholder="0"
        value={form.current}
        onChange={(value) => setField('current', value)}
      />
    </FormField>
  );
}

function TargetAmountField({
  form,
  setField,
}: Readonly<Pick<AmountFieldsSavingsPortfolioProps, 'form' | 'setField'>>) {
  return (
    <FormField label="Target Amount" required>
      <TextInput
        type="number"
        inputMode="decimal"
        step="0.01"
        placeholder="15000"
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

function AmountFieldsSavingsPortfolio(
  props: Readonly<AmountFieldsSavingsPortfolioProps & { portfolioTotal: number; netWorth: number }>,
) {
  const { type, form, setField, savingsAccounts, fmtBase, portfolioTotal, netWorth } = props;
  const selectedSource =
    type === 'savings'
      ? savingsAccounts.find((account) => String(account.id) === form.sourceId)
      : undefined;

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
          <LinkedCurrentAmountSummary selectedSource={selectedSource} fmtBase={fmtBase} />
        ) : (
          <ManualCurrentAmountField form={form} setField={setField} />
        ))}
      <TargetAmountField form={form} setField={setField} />
    </div>
  );
}

function AmountFieldsSalary({
  form,
  setField,
}: Readonly<{ form: GoalFormState; setField: SetField }>) {
  return (
    <FormField label="Target Annual Gross" required>
      <TextInput
        type="number"
        inputMode="decimal"
        step="0.01"
        placeholder="90000"
        value={form.target}
        onChange={(value) => setField('target', value)}
      />
      <p className="text-[10px] text-slate-400 mt-1.5 flex items-center gap-1">
        <Link2 size={10} /> Current salary auto-linked from your Salary page
      </p>
    </FormField>
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

function AmountFieldsInvestHabitLinked({
  form,
  setField,
  baseCurrency,
}: Readonly<{
  form: GoalFormState;
  setField: SetField;
  baseCurrency: string;
}>) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <FormField label={`Monthly Target (${baseCurrency})`} required>
        <TextInput
          type="number"
          inputMode="decimal"
          step="0.01"
          placeholder="500"
          value={form.monthlyTarget}
          onChange={(value) => setField('monthlyTarget', value)}
        />
      </FormField>
      <FormField label="Months in Period">
        <TextInput
          type="number"
          placeholder="12"
          value={form.totalMonths}
          onChange={(value) => setField('totalMonths', value)}
        />
      </FormField>
      <div className="col-span-2 rounded-xl border border-indigo-100 bg-indigo-50/70 px-3 py-2.5">
        <p className="text-[10px] text-slate-400 flex items-center gap-1">
          <Link2 size={10} /> Monthly buy transactions auto-tracked from your investments.
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
  if (type === 'salary') return <AmountFieldsSalary form={form} setField={setField} />;
  if (type === 'invest_habit') {
    return (
      <AmountFieldsInvestHabitLinked form={form} setField={setField} baseCurrency={baseCurrency} />
    );
  }
  if (type === 'annual') return <AmountFieldsAnnual form={form} setField={setField} />;
  return null;
}

function GoalDetailsNameRow({
  form,
  setField,
}: Readonly<{ form: GoalFormState; setField: SetField }>) {
  return (
    <div className="flex gap-3">
      <FormField label="Icon" className="w-14 flex-shrink-0">
        <TextInput
          className="h-[42px] px-0 text-center text-xl"
          value={form.emoji}
          onChange={(value) => setField('emoji', value)}
          maxLength={2}
        />
      </FormField>
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

function GoalDetailsDateRow({
  form,
  setField,
}: Readonly<{ form: GoalFormState; setField: SetField }>) {
  const handleDateChange = (dateStr: string) => {
    if (!dateStr) return;
    const deadline = dateStringToDeadline(dateStr);
    const year = dateStr.split('-')[0];
    setField('deadline', deadline);
    setField('year', year);
  };

  const dateValue = deadlineToDateString(form.deadline);

  return (
    <FormField label="Deadline">
      <DateInput value={dateValue} onChange={handleDateChange} />
    </FormField>
  );
}

function GoalDetailsDeadlineContributionRow({
  form,
  setField,
  baseCurrency,
}: Readonly<{ form: GoalFormState; setField: SetField; baseCurrency: string }>) {
  const handleDateChange = (dateStr: string) => {
    if (!dateStr) return;
    const deadline = dateStringToDeadline(dateStr);
    const year = dateStr.split('-')[0];
    setField('deadline', deadline);
    setField('year', year);
  };

  const dateValue = deadlineToDateString(form.deadline);

  return (
    <div className="grid grid-cols-2 gap-3">
      <FormField label="Deadline">
        <DateInput value={dateValue} onChange={handleDateChange} />
      </FormField>
      <MonthlyContributionField form={form} setField={setField} baseCurrency={baseCurrency} />
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

function GoalDetailsStep({
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
      {type === 'savings' ? (
        <GoalDetailsDeadlineContributionRow
          form={form}
          setField={setField}
          baseCurrency={baseCurrency}
        />
      ) : (
        <GoalDetailsDateRow form={form} setField={setField} />
      )}
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

export function AddGoalModal({ onClose, onSave }: Readonly<AddGoalModalProps>) {
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
  } = useAddGoalModal(onSave, onClose);
  const subtitle =
    step === 'type'
      ? 'Choose a goal type to get started'
      : `${GOAL_TYPE_META[type].label} - fill in the details`;

  return (
    <Modal
      title="Add Goal"
      subtitle={subtitle}
      onClose={onClose}
      maxWidth="lg"
      scrollable
      bodyClassName="p-0 space-y-0"
      footer={
        step === 'details' ? (
          <ModalFooter
            onCancel={onClose}
            onConfirm={handleSave}
            confirmLabel="Save Goal"
            disabled={!form.name.trim()}
          />
        ) : undefined
      }
    >
      {step === 'type' ? (
        <GoalTypeStep
          onSelect={(selectedType) => {
            setType(selectedType);
            if (selectedType !== 'savings') setField('sourceId', '');
            setStep('details');
          }}
        />
      ) : (
        <GoalDetailsStep
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
          onBack={() => setStep('type')}
        />
      )}
    </Modal>
  );
}
