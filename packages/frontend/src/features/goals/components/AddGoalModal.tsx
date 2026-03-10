import { Link2, X } from 'lucide-react';
import { FormField, SelectInput, Textarea, TextInput } from '@/components/ui';
import type { GoalType } from '@quro/shared';
import { useAddGoalModal } from '../hooks';
import { COLORS, GOAL_TYPE_META } from '../utils/goals-constants';
import type { AddGoalModalProps, GoalFormField, GoalFormState, GoalMeta } from '../types';

type SetField = (key: GoalFormField, value: string) => void;

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

function AmountFieldsSavingsPortfolio({
  type,
  form,
  setField,
}: Readonly<{
  type: GoalType;
  form: GoalFormState;
  setField: SetField;
}>) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <FormField label="Current Amount">
        <TextInput
          type="number"
          placeholder="0"
          value={form.current}
          onChange={(value) => setField('current', value)}
        />
      </FormField>
      <FormField label="Target Amount" required>
        <TextInput
          type="number"
          placeholder="15000"
          value={form.target}
          onChange={(value) => setField('target', value)}
        />
      </FormField>
      {type === 'savings' && (
        <FormField label="Monthly Contribution" className="col-span-2">
          <TextInput
            type="number"
            placeholder="500"
            value={form.monthlyContrib}
            onChange={(value) => setField('monthlyContrib', value)}
          />
        </FormField>
      )}
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

function AmountFieldsInvestHabit({
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

function GoalDetailsAmountFields({
  type,
  form,
  setField,
  baseCurrency,
}: Readonly<{
  type: GoalType;
  form: GoalFormState;
  setField: SetField;
  baseCurrency: string;
}>) {
  if (type === 'savings' || type === 'portfolio' || type === 'net_worth') {
    return <AmountFieldsSavingsPortfolio type={type} form={form} setField={setField} />;
  }
  if (type === 'salary') return <AmountFieldsSalary form={form} setField={setField} />;
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
  return (
    <div className="grid grid-cols-2 gap-3">
      <FormField label="Deadline">
        <TextInput
          placeholder="Dec 2026"
          value={form.deadline}
          onChange={(value) => setField('deadline', value)}
        />
      </FormField>
      <FormField label="Year">
        <SelectInput
          value={form.year}
          options={['2025', '2026', '2027', '2028', '2029', '2030']}
          onChange={(value) => setField('year', value)}
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

function GoalDetailsStep({
  type,
  form,
  setField,
  baseCurrency,
  onBack,
}: Readonly<{
  type: GoalType;
  form: GoalFormState;
  setField: SetField;
  baseCurrency: string;
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
      />
      <GoalDetailsDateRow form={form} setField={setField} />
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

function AddGoalModalFooter({
  onClose,
  onSave,
  canSave,
}: Readonly<{ onClose: () => void; onSave: () => void; canSave: boolean }>) {
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
        disabled={!canSave}
        className="flex-1 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white py-2.5 text-sm font-medium transition-colors"
      >
        Save Goal
      </button>
    </div>
  );
}

function AddGoalModalHeader({
  step,
  type,
  onClose,
}: Readonly<{ step: 'type' | 'details'; type: GoalType; onClose: () => void }>) {
  return (
    <div className="bg-gradient-to-r from-[#0a0f1e] to-[#1a1f3e] px-6 py-5 flex items-center justify-between flex-shrink-0">
      <div>
        <h2 className="font-bold text-white">Add Goal</h2>
        <p className="text-xs text-indigo-300 mt-0.5">
          {step === 'type'
            ? 'Choose a goal type to get started'
            : `${GOAL_TYPE_META[type].label} - fill in the details`}
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

export function AddGoalModal({ onClose, onSave }: Readonly<AddGoalModalProps>) {
  const { baseCurrency, step, type, form, setField, handleSave, setType, setStep } =
    useAddGoalModal(onSave, onClose);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
        <AddGoalModalHeader step={step} type={type} onClose={onClose} />
        <div className="overflow-y-auto flex-1">
          {step === 'type' ? (
            <GoalTypeStep
              onSelect={(selectedType) => {
                setType(selectedType);
                setStep('details');
              }}
            />
          ) : (
            <GoalDetailsStep
              type={type}
              form={form}
              setField={setField}
              baseCurrency={baseCurrency}
              onBack={() => setStep('type')}
            />
          )}
        </div>
        {step === 'details' && (
          <AddGoalModalFooter
            onClose={onClose}
            onSave={handleSave}
            canSave={Boolean(form.name.trim())}
          />
        )}
      </div>
    </div>
  );
}
