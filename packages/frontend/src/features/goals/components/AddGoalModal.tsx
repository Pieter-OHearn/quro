import { Link2, X } from 'lucide-react';
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

const inputCls =
  'w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300';

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
      <div>
        <label className="block text-xs font-semibold text-slate-600 mb-1.5">Current Amount</label>
        <input
          type="number"
          className={inputCls}
          placeholder="0"
          value={form.current}
          onChange={(event) => setField('current', event.target.value)}
        />
      </div>
      <div>
        <label className="block text-xs font-semibold text-slate-600 mb-1.5">
          Target Amount <span className="text-rose-500">*</span>
        </label>
        <input
          type="number"
          className={inputCls}
          placeholder="15000"
          value={form.target}
          onChange={(event) => setField('target', event.target.value)}
        />
      </div>
      {type === 'savings' && (
        <div className="col-span-2">
          <label className="block text-xs font-semibold text-slate-600 mb-1.5">
            Monthly Contribution
          </label>
          <input
            type="number"
            className={inputCls}
            placeholder="500"
            value={form.monthlyContrib}
            onChange={(event) => setField('monthlyContrib', event.target.value)}
          />
        </div>
      )}
    </div>
  );
}

function AmountFieldsSalary({
  form,
  setField,
}: Readonly<{ form: GoalFormState; setField: SetField }>) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-600 mb-1.5">
        Target Annual Gross <span className="text-rose-500">*</span>
      </label>
      <input
        type="number"
        className={inputCls}
        placeholder="90000"
        value={form.target}
        onChange={(event) => setField('target', event.target.value)}
      />
      <p className="text-[10px] text-slate-400 mt-1.5 flex items-center gap-1">
        <Link2 size={10} /> Current salary auto-linked from your Salary page
      </p>
    </div>
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
      <div>
        <label className="block text-xs font-semibold text-slate-600 mb-1.5">
          Monthly Target ({baseCurrency}) <span className="text-rose-500">*</span>
        </label>
        <input
          type="number"
          className={inputCls}
          placeholder="500"
          value={form.monthlyTarget}
          onChange={(event) => setField('monthlyTarget', event.target.value)}
        />
      </div>
      <div>
        <label className="block text-xs font-semibold text-slate-600 mb-1.5">
          Months in Period
        </label>
        <input
          type="number"
          className={inputCls}
          placeholder="12"
          value={form.totalMonths}
          onChange={(event) => setField('totalMonths', event.target.value)}
        />
      </div>
    </div>
  );
}

function AmountFieldsAnnual({
  form,
  setField,
}: Readonly<{ form: GoalFormState; setField: SetField }>) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <div>
        <label className="block text-xs font-semibold text-slate-600 mb-1.5">
          Current Progress
        </label>
        <input
          type="number"
          className={inputCls}
          placeholder="0"
          value={form.current}
          onChange={(event) => setField('current', event.target.value)}
        />
      </div>
      <div>
        <label className="block text-xs font-semibold text-slate-600 mb-1.5">
          Target <span className="text-rose-500">*</span>
        </label>
        <input
          type="number"
          className={inputCls}
          placeholder="4"
          value={form.target}
          onChange={(event) => setField('target', event.target.value)}
        />
      </div>
      <div className="col-span-2">
        <label className="block text-xs font-semibold text-slate-600 mb-1.5">
          Unit label <span className="text-slate-400 font-normal">optional</span>
        </label>
        <input
          className={inputCls}
          placeholder="e.g. books, %, EUR/mo"
          value={form.unit}
          onChange={(event) => setField('unit', event.target.value)}
        />
      </div>
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
      <div className="flex-shrink-0">
        <label className="block text-xs font-semibold text-slate-600 mb-1.5">Icon</label>
        <input
          className="w-14 h-[42px] rounded-xl border border-slate-200 bg-slate-50 text-xl text-center focus:outline-none focus:ring-2 focus:ring-indigo-300"
          value={form.emoji}
          onChange={(event) => setField('emoji', event.target.value)}
          maxLength={2}
        />
      </div>
      <div className="flex-1">
        <label className="block text-xs font-semibold text-slate-600 mb-1.5">
          Goal Name <span className="text-rose-500">*</span>
        </label>
        <input
          className={inputCls}
          placeholder="e.g. Hit 100k salary"
          value={form.name}
          onChange={(event) => setField('name', event.target.value)}
        />
      </div>
    </div>
  );
}

function GoalDetailsDateRow({
  form,
  setField,
}: Readonly<{ form: GoalFormState; setField: SetField }>) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <div>
        <label className="block text-xs font-semibold text-slate-600 mb-1.5">Deadline</label>
        <input
          className={inputCls}
          placeholder="Dec 2026"
          value={form.deadline}
          onChange={(event) => setField('deadline', event.target.value)}
        />
      </div>
      <div>
        <label className="block text-xs font-semibold text-slate-600 mb-1.5">Year</label>
        <select
          className={inputCls}
          value={form.year}
          onChange={(event) => setField('year', event.target.value)}
        >
          {['2025', '2026', '2027', '2028', '2029', '2030'].map((year) => (
            <option key={year}>{year}</option>
          ))}
        </select>
      </div>
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
      <div>
        <label className="block text-xs font-semibold text-slate-600 mb-1.5">
          Notes <span className="text-slate-400 font-normal">optional</span>
        </label>
        <textarea
          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none"
          rows={2}
          placeholder="Any extra context..."
          value={form.notes}
          onChange={(event) => setField('notes', event.target.value)}
        />
      </div>
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
