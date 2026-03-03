import { useEffect, useMemo, useState, type ElementType } from 'react';
import {
  AlertCircle,
  ArrowUpRight,
  Briefcase,
  Calendar,
  Check,
  CheckCircle2,
  ClipboardList,
  Minus,
  PiggyBank,
  Plus,
  RefreshCw,
  Sparkles,
  Target,
  Trash2,
  Trophy,
  TrendingUp,
  X,
  BarChart2,
  Link2,
  Loader2,
} from 'lucide-react';
import { useCurrency } from '@/lib/CurrencyContext';
import type { Goal, GoalType } from '@quro/shared';
import { usePayslips } from '@/features/salary/hooks';
import { useGoals, useCreateGoal, useDeleteGoal, useUpdateGoal } from './hooks';

type GoalStatus = 'complete' | 'on_track' | 'at_risk' | 'pending';
type FilterKey = 'all' | 'savings' | 'career' | 'investing' | 'annual';

type GoalMeta = {
  label: string;
  Icon: ElementType;
  bg: string;
  text: string;
  filterKey: FilterKey;
  description: string;
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const COLORS = [
  '#6366f1',
  '#0ea5e9',
  '#f59e0b',
  '#10b981',
  '#f97316',
  '#ec4899',
  '#14b8a6',
  '#8b5cf6',
  '#06b6d4',
  '#a78bfa',
  '#fb7185',
  '#94a3b8',
];

const GOAL_TYPE_META: Record<GoalType, GoalMeta> = {
  savings: {
    label: 'Savings Goal',
    Icon: PiggyBank,
    bg: 'bg-indigo-50',
    text: 'text-indigo-600',
    filterKey: 'savings',
    description: 'Save up to a target amount',
  },
  salary: {
    label: 'Career',
    Icon: Briefcase,
    bg: 'bg-emerald-50',
    text: 'text-emerald-600',
    filterKey: 'career',
    description: 'Hit a gross salary milestone',
  },
  invest_habit: {
    label: 'Invest Habit',
    Icon: RefreshCw,
    bg: 'bg-sky-50',
    text: 'text-sky-600',
    filterKey: 'investing',
    description: 'Invest a set amount every month',
  },
  portfolio: {
    label: 'Portfolio Value',
    Icon: BarChart2,
    bg: 'bg-sky-50',
    text: 'text-sky-600',
    filterKey: 'investing',
    description: 'Grow your portfolio to a target',
  },
  net_worth: {
    label: 'Net Worth',
    Icon: Trophy,
    bg: 'bg-pink-50',
    text: 'text-pink-600',
    filterKey: 'annual',
    description: 'Reach a total net worth milestone',
  },
  annual: {
    label: 'Annual Goal',
    Icon: ClipboardList,
    bg: 'bg-teal-50',
    text: 'text-teal-600',
    filterKey: 'annual',
    description: 'Yearly financial habit or target',
  },
};

const STATUS_META: Record<GoalStatus, { label: string; color: string; dot: string }> = {
  complete: {
    label: 'Completed',
    color: 'text-emerald-700 bg-emerald-100',
    dot: 'bg-emerald-500',
  },
  on_track: {
    label: 'On Track',
    color: 'text-indigo-700 bg-indigo-100',
    dot: 'bg-indigo-500',
  },
  at_risk: {
    label: 'At Risk',
    color: 'text-amber-700 bg-amber-100',
    dot: 'bg-amber-500',
  },
  pending: {
    label: 'In Progress',
    color: 'text-slate-600 bg-slate-100',
    dot: 'bg-slate-400',
  },
};

const FILTERS: { key: FilterKey; label: string; Icon: ElementType }[] = [
  { key: 'all', label: 'All', Icon: Target },
  { key: 'savings', label: 'Savings', Icon: PiggyBank },
  { key: 'career', label: 'Career', Icon: Briefcase },
  { key: 'investing', label: 'Investing', Icon: TrendingUp },
  { key: 'annual', label: 'Annual', Icon: ClipboardList },
];

const DEFAULT_GOAL_TYPE: GoalType = 'savings';
const TYPE_VALUES: GoalType[] = [
  'savings',
  'salary',
  'invest_habit',
  'portfolio',
  'net_worth',
  'annual',
];

const parseGoalYear = (goal: Goal, fallbackYear: number): number => {
  if (typeof goal.year === 'number' && Number.isFinite(goal.year)) {
    return Math.trunc(goal.year);
  }
  const match = goal.deadline?.match(/\b(19|20)\d{2}\b/);
  if (match) {
    const parsed = Number(match[0]);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallbackYear;
};

const normalizeGoalType = (goal: Goal): GoalType => {
  if (goal.type && TYPE_VALUES.includes(goal.type)) return goal.type;
  return DEFAULT_GOAL_TYPE;
};

const getAmountBasedPct = (current: number, target: number): number => {
  if (target <= 0) return 0;
  return Math.min((current / target) * 100, 100);
};

const getAnnualPct = (goal: Goal): number => {
  const value = goal.currentAmount || 0;
  const target = goal.targetAmount || 0;
  if (target <= 0) return 0;
  if (goal.unit === '€/mo' && value > target) {
    return Math.max(100 - ((value - target) / target) * 100, 0);
  }
  return Math.min((value / target) * 100, 100);
};

const getInvestHabitPct = (goal: Goal): number => {
  const totalMonths = goal.totalMonths ?? 12;
  if (totalMonths <= 0) return 0;
  return Math.min(((goal.monthsCompleted ?? 0) / totalMonths) * 100, 100);
};

const getGoalPct = (goal: Goal, annualGross: number): number => {
  const type = normalizeGoalType(goal);
  if (type === 'savings' || type === 'portfolio' || type === 'net_worth') {
    return getAmountBasedPct(goal.currentAmount || 0, goal.targetAmount || 0);
  }
  if (type === 'annual') return getAnnualPct(goal);
  if (type === 'salary') return getAmountBasedPct(annualGross, goal.targetAmount || 0);
  if (type === 'invest_habit') return getInvestHabitPct(goal);
  return 0;
};

const getExpectedProgress = (year: number, currentYear: number): number => {
  if (year < currentYear) return 100;
  if (year > currentYear) return 0;
  return ((new Date().getMonth() + 1) / 12) * 100;
};

const getGoalStatus = (goal: Goal, annualGross: number, currentYear: number): GoalStatus => {
  const pct = getGoalPct(goal, annualGross);
  if (pct >= 100) return 'complete';
  if (normalizeGoalType(goal) === 'salary') return 'pending';
  const year = parseGoalYear(goal, currentYear);
  const expectedProgress = getExpectedProgress(year, currentYear);
  return pct >= expectedProgress ? 'on_track' : 'at_risk';
};

type AddGoalModalProps = {
  onClose: () => void;
  onSave: (goal: Omit<Goal, 'id'>) => void;
};

const buildSavingsPayload = (
  base: Omit<Goal, 'id'>,
  form: Record<string, string>,
): Omit<Goal, 'id'> => {
  base.currentAmount = parseFloat(form.current) || 0;
  base.targetAmount = parseFloat(form.target) || 0;
  base.monthlyContribution = parseFloat(form.monthlyContrib) || 0;
  return base;
};

const buildPortfolioOrNetWorthPayload = (
  base: Omit<Goal, 'id'>,
  form: Record<string, string>,
): Omit<Goal, 'id'> => {
  base.currentAmount = parseFloat(form.current) || 0;
  base.targetAmount = parseFloat(form.target) || 0;
  return base;
};

const buildSalaryPayload = (
  base: Omit<Goal, 'id'>,
  form: Record<string, string>,
): Omit<Goal, 'id'> => {
  base.targetAmount = parseFloat(form.target) || 0;
  return base;
};

const buildInvestHabitPayload = (
  base: Omit<Goal, 'id'>,
  form: Record<string, string>,
): Omit<Goal, 'id'> => {
  base.monthlyTarget = parseFloat(form.monthlyTarget) || 0;
  base.monthsCompleted = 0;
  base.totalMonths = parseInt(form.totalMonths, 10) || 12;
  return base;
};

const buildAnnualPayload = (
  base: Omit<Goal, 'id'>,
  form: Record<string, string>,
): Omit<Goal, 'id'> => {
  base.currentAmount = parseFloat(form.current) || 0;
  base.targetAmount = parseFloat(form.target) || 0;
  base.unit = form.unit || null;
  return base;
};

const buildGoalPayload = (
  type: GoalType,
  base: Omit<Goal, 'id'>,
  form: Record<string, string>,
): Omit<Goal, 'id'> => {
  if (type === 'savings') return buildSavingsPayload(base, form);
  if (type === 'portfolio' || type === 'net_worth')
    return buildPortfolioOrNetWorthPayload(base, form);
  if (type === 'salary') return buildSalaryPayload(base, form);
  if (type === 'invest_habit') return buildInvestHabitPayload(base, form);
  if (type === 'annual') return buildAnnualPayload(base, form);
  return base;
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

// ─── GoalDetailsAmountFields sub-renderers ────────────────────────────────────

const inputCls =
  'w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300';

function AmountFieldsSavingsPortfolio({
  type,
  form,
  set,
}: Readonly<{
  type: GoalType;
  form: Record<string, string>;
  set: (k: string, v: string) => void;
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
          onChange={(e) => set('current', e.target.value)}
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
          onChange={(e) => set('target', e.target.value)}
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
            onChange={(e) => set('monthlyContrib', e.target.value)}
          />
        </div>
      )}
    </div>
  );
}

function AmountFieldsSalary({
  form,
  set,
}: Readonly<{ form: Record<string, string>; set: (k: string, v: string) => void }>) {
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
        onChange={(e) => set('target', e.target.value)}
      />
      <p className="text-[10px] text-slate-400 mt-1.5 flex items-center gap-1">
        <Link2 size={10} /> Current salary auto-linked from your Salary page
      </p>
    </div>
  );
}

function AmountFieldsInvestHabit({
  form,
  set,
  baseCurrency,
}: Readonly<{
  form: Record<string, string>;
  set: (k: string, v: string) => void;
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
          onChange={(e) => set('monthlyTarget', e.target.value)}
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
          onChange={(e) => set('totalMonths', e.target.value)}
        />
      </div>
    </div>
  );
}

function AmountFieldsAnnual({
  form,
  set,
}: Readonly<{ form: Record<string, string>; set: (k: string, v: string) => void }>) {
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
          onChange={(e) => set('current', e.target.value)}
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
          onChange={(e) => set('target', e.target.value)}
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
          onChange={(e) => set('unit', e.target.value)}
        />
      </div>
    </div>
  );
}

function GoalDetailsAmountFields({
  type,
  form,
  set,
  baseCurrency,
}: Readonly<{
  type: GoalType;
  form: Record<string, string>;
  set: (key: string, value: string) => void;
  baseCurrency: string;
}>) {
  if (type === 'savings' || type === 'portfolio' || type === 'net_worth') {
    return <AmountFieldsSavingsPortfolio type={type} form={form} set={set} />;
  }
  if (type === 'salary') return <AmountFieldsSalary form={form} set={set} />;
  if (type === 'invest_habit') {
    return <AmountFieldsInvestHabit form={form} set={set} baseCurrency={baseCurrency} />;
  }
  if (type === 'annual') return <AmountFieldsAnnual form={form} set={set} />;
  return null;
}

// ─── GoalDetailsStep ──────────────────────────────────────────────────────────

function GoalDetailsNameRow({
  form,
  set,
}: Readonly<{ form: Record<string, string>; set: (k: string, v: string) => void }>) {
  return (
    <div className="flex gap-3">
      <div className="flex-shrink-0">
        <label className="block text-xs font-semibold text-slate-600 mb-1.5">Icon</label>
        <input
          className="w-14 h-[42px] rounded-xl border border-slate-200 bg-slate-50 text-xl text-center focus:outline-none focus:ring-2 focus:ring-indigo-300"
          value={form.emoji}
          onChange={(e) => set('emoji', e.target.value)}
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
          onChange={(e) => set('name', e.target.value)}
        />
      </div>
    </div>
  );
}

function GoalDetailsDateRow({
  form,
  set,
}: Readonly<{ form: Record<string, string>; set: (k: string, v: string) => void }>) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <div>
        <label className="block text-xs font-semibold text-slate-600 mb-1.5">Deadline</label>
        <input
          className={inputCls}
          placeholder="Dec 2026"
          value={form.deadline}
          onChange={(e) => set('deadline', e.target.value)}
        />
      </div>
      <div>
        <label className="block text-xs font-semibold text-slate-600 mb-1.5">Year</label>
        <select
          className={inputCls}
          value={form.year}
          onChange={(e) => set('year', e.target.value)}
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
  set,
  baseCurrency,
  onBack,
}: Readonly<{
  type: GoalType;
  form: Record<string, string>;
  set: (key: string, value: string) => void;
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
      <GoalDetailsNameRow form={form} set={set} />
      <GoalDetailsAmountFields type={type} form={form} set={set} baseCurrency={baseCurrency} />
      <GoalDetailsDateRow form={form} set={set} />
      <GoalColorPicker selected={form.color} onSelect={(c) => set('color', c)} />
      <div>
        <label className="block text-xs font-semibold text-slate-600 mb-1.5">
          Notes <span className="text-slate-400 font-normal">optional</span>
        </label>
        <textarea
          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none"
          rows={2}
          placeholder="Any extra context..."
          value={form.notes}
          onChange={(e) => set('notes', e.target.value)}
        />
      </div>
    </div>
  );
}

// ─── AddGoalModal ─────────────────────────────────────────────────────────────

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

function useAddGoalModal(onSave: (g: Omit<Goal, 'id'>) => void, onClose: () => void) {
  const { baseCurrency } = useCurrency();
  const [step, setStep] = useState<'type' | 'details'>('type');
  const [type, setType] = useState<GoalType>('savings');
  const [form, setForm] = useState({
    name: '',
    emoji: '🎯',
    color: COLORS[0],
    notes: '',
    deadline: 'Dec 2026',
    year: String(new Date().getFullYear()),
    current: '',
    target: '',
    monthlyContrib: '',
    monthlyTarget: '',
    totalMonths: '12',
    unit: '',
  });
  const set = (key: string, value: string) => setForm((prev) => ({ ...prev, [key]: value }));
  const handleSave = () => {
    if (!form.name.trim()) return;
    const base: Omit<Goal, 'id'> = {
      type,
      name: form.name.trim(),
      emoji: form.emoji,
      color: form.color,
      notes: form.notes,
      deadline: form.deadline,
      year: parseInt(form.year, 10) || new Date().getFullYear(),
      currentAmount: 0,
      targetAmount: 0,
      monthlyContribution: 0,
      monthlyTarget: null,
      monthsCompleted: null,
      totalMonths: null,
      unit: null,
      category: GOAL_TYPE_META[type].label,
      currency: baseCurrency as Goal['currency'],
    };
    onSave(buildGoalPayload(type, base, form));
    onClose();
  };
  return { baseCurrency, step, type, form, set, handleSave, setType, setStep };
}

function AddGoalModal({ onClose, onSave }: AddGoalModalProps) {
  const { baseCurrency, step, type, form, set, handleSave, setType, setStep } = useAddGoalModal(
    onSave,
    onClose,
  );
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
        <AddGoalModalHeader step={step} type={type} onClose={onClose} />
        <div className="overflow-y-auto flex-1">
          {step === 'type' ? (
            <GoalTypeStep
              onSelect={(t) => {
                setType(t);
                setStep('details');
              }}
            />
          ) : (
            <GoalDetailsStep
              type={type}
              form={form}
              set={set}
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

// ─── Goal card sub-components (per type) ─────────────────────────────────────

type CardProps = {
  goal: Goal;
  annualGross: number;
  currentYear: number;
  onDelete: (id: number) => void;
  onUpdateMonths: (id: number, delta: number) => void;
};

function ProgressBar({ pct, color }: Readonly<{ pct: number; color: string }>) {
  return (
    <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
      <div
        className="h-full rounded-full transition-all duration-700"
        style={{ width: `${pct}%`, backgroundColor: color }}
      />
    </div>
  );
}

function SavingsDetailsRow({
  currentAmount,
  targetAmount,
  monthlyContrib,
  status,
  fmtBase,
}: Readonly<{
  currentAmount: number;
  targetAmount: number;
  monthlyContrib: number;
  status: GoalStatus;
  fmtBase: (n: number) => string;
}>) {
  const remaining = Math.max(0, targetAmount - currentAmount);
  return (
    <div className="flex items-end justify-between">
      <div>
        <p className="font-bold text-slate-900">{fmtBase(currentAmount)}</p>
        <p className="text-xs text-slate-400">of {fmtBase(targetAmount)}</p>
      </div>
      {status !== 'complete' && (
        <div className="text-right">
          <p className="text-xs text-slate-500">{fmtBase(remaining)} to go</p>
          {monthlyContrib > 0 && (
            <p className="text-xs text-slate-400">
              ~{Math.ceil(remaining / monthlyContrib)}mo at {fmtBase(monthlyContrib)}/mo
            </p>
          )}
        </div>
      )}
      {status === 'complete' && <p className="text-sm text-emerald-600 font-semibold">Done!</p>}
    </div>
  );
}

function GoalCardSavings({
  color,
  currentAmount,
  targetAmount,
  monthlyContrib,
  clampedPct,
  status,
  fmtBase,
}: Readonly<{
  color: string;
  currentAmount: number;
  targetAmount: number;
  monthlyContrib: number;
  clampedPct: number;
  status: GoalStatus;
  fmtBase: (n: number) => string;
}>) {
  return (
    <>
      <div>
        <div className="flex justify-between mb-1.5">
          <span className="text-xs text-slate-500">Progress</span>
          <span className="text-xs font-semibold" style={{ color }}>
            {clampedPct.toFixed(0)}%
          </span>
        </div>
        <ProgressBar pct={clampedPct} color={color} />
      </div>
      <SavingsDetailsRow
        currentAmount={currentAmount}
        targetAmount={targetAmount}
        monthlyContrib={monthlyContrib}
        status={status}
        fmtBase={fmtBase}
      />
    </>
  );
}

function SalaryComparisonGrid({
  color,
  targetAmount,
  annualGross,
  fmtBase,
}: Readonly<{
  color: string;
  targetAmount: number;
  annualGross: number;
  fmtBase: (n: number) => string;
}>) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <div className="bg-slate-50 rounded-xl px-3 py-2.5">
        <p className="text-[10px] text-slate-400 mb-0.5">Current Gross</p>
        <p className="font-bold text-slate-800">
          {fmtBase(annualGross)}
          <span className="text-xs font-normal text-slate-400">/yr</span>
        </p>
      </div>
      <div className="rounded-xl px-3 py-2.5" style={{ backgroundColor: `${color}18` }}>
        <p className="text-[10px] text-slate-400 mb-0.5">Target Gross</p>
        <p className="font-bold" style={{ color }}>
          {fmtBase(targetAmount)}
          <span className="text-xs font-normal opacity-60">/yr</span>
        </p>
      </div>
    </div>
  );
}

function GoalCardSalary({
  color,
  targetAmount,
  annualGross,
  clampedPct,
  fmtBase,
}: Readonly<{
  color: string;
  targetAmount: number;
  annualGross: number;
  clampedPct: number;
  fmtBase: (n: number) => string;
}>) {
  return (
    <>
      <div>
        <div className="flex justify-between mb-1.5">
          <span className="text-xs text-slate-500">Current - Target</span>
          <span className="text-xs font-semibold" style={{ color }}>
            {clampedPct.toFixed(0)}%
          </span>
        </div>
        <ProgressBar pct={clampedPct} color={color} />
      </div>
      <SalaryComparisonGrid
        color={color}
        targetAmount={targetAmount}
        annualGross={annualGross}
        fmtBase={fmtBase}
      />
      <div className="flex items-center gap-2">
        <ArrowUpRight size={13} className="text-emerald-500 flex-shrink-0" />
        <p className="text-xs text-slate-600">
          {annualGross > 0 ? (
            <>
              <strong>{((targetAmount / annualGross - 1) * 100).toFixed(1)}% raise</strong> -{' '}
              {fmtBase(Math.max(0, targetAmount - annualGross))} gap
            </>
          ) : (
            'Add a payslip to calculate required raise'
          )}
        </p>
      </div>
    </>
  );
}

function InvestHabitMonthGrid({
  totalMonths,
  monthsCompleted,
  color,
}: Readonly<{ totalMonths: number; monthsCompleted: number; color: string }>) {
  return (
    <div className="grid grid-cols-12 gap-px">
      {MONTHS.slice(0, Math.max(1, Math.min(totalMonths, 12))).map((month, index) => {
        const done = index < monthsCompleted;
        return (
          <div key={month} className="flex flex-col items-center gap-1">
            <div
              className={`w-full aspect-square rounded-sm transition-all ${done ? '' : 'bg-slate-100'}`}
              style={done ? { backgroundColor: color } : undefined}
            />
            <span className="text-[8px] text-slate-400 leading-none">{month[0]}</span>
          </div>
        );
      })}
    </div>
  );
}

function InvestHabitControls({
  goalId,
  monthsCompleted,
  totalMonths,
  onUpdateMonths,
}: Readonly<{
  goalId: number;
  monthsCompleted: number;
  totalMonths: number;
  onUpdateMonths: (id: number, delta: number) => void;
}>) {
  return (
    <div className="flex items-center gap-1">
      <button
        onClick={() => onUpdateMonths(goalId, -1)}
        disabled={monthsCompleted <= 0}
        className="w-7 h-7 rounded-lg border border-slate-200 flex items-center justify-center hover:bg-slate-50 disabled:opacity-30 transition-colors"
      >
        <Minus size={11} />
      </button>
      <span className="text-xs text-slate-500 px-1">{monthsCompleted}</span>
      <button
        onClick={() => onUpdateMonths(goalId, 1)}
        disabled={monthsCompleted >= totalMonths}
        className="w-7 h-7 rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-600 flex items-center justify-center hover:bg-indigo-100 disabled:opacity-30 transition-colors"
      >
        <Check size={11} />
      </button>
    </div>
  );
}

type InvestHabitCardProps = Readonly<{
  goal: Goal;
  color: string;
  monthlyTarget: number;
  monthsCompleted: number;
  totalMonths: number;
  status: GoalStatus;
  fmtBase: (n: number) => string;
  onUpdateMonths: (id: number, delta: number) => void;
}>;

function InvestHabitProgress({
  color,
  monthlyTarget,
  monthsCompleted,
  totalMonths,
  fmtBase,
}: Readonly<
  Pick<
    InvestHabitCardProps,
    'color' | 'monthlyTarget' | 'monthsCompleted' | 'totalMonths' | 'fmtBase'
  >
>) {
  return (
    <div>
      <div className="flex justify-between mb-2">
        <span className="text-xs text-slate-500">Monthly hits</span>
        <span className="text-xs font-semibold" style={{ color }}>
          {monthsCompleted}/{totalMonths} months
        </span>
      </div>
      <InvestHabitMonthGrid
        totalMonths={totalMonths}
        monthsCompleted={monthsCompleted}
        color={color}
      />
      <div className="mt-3">
        <p className="font-bold text-slate-900">{fmtBase(monthlyTarget * monthsCompleted)}</p>
        <p className="text-xs text-slate-400">
          invested so far - {fmtBase(monthlyTarget)}/mo target
        </p>
      </div>
    </div>
  );
}

function GoalCardInvestHabit({
  goal,
  color,
  monthlyTarget,
  monthsCompleted,
  totalMonths,
  status,
  fmtBase,
  onUpdateMonths,
}: InvestHabitCardProps) {
  return (
    <>
      <InvestHabitProgress
        color={color}
        monthlyTarget={monthlyTarget}
        monthsCompleted={monthsCompleted}
        totalMonths={totalMonths}
        fmtBase={fmtBase}
      />
      {status !== 'complete' && (
        <div className="flex items-center justify-end">
          <InvestHabitControls
            goalId={goal.id}
            monthsCompleted={monthsCompleted}
            totalMonths={totalMonths}
            onUpdateMonths={onUpdateMonths}
          />
        </div>
      )}
    </>
  );
}

const getAnnualBarWidth = (
  lowerIsBetter: boolean,
  clampedPct: number,
  currentAmount: number,
  targetAmount: number,
): number => {
  if (lowerIsBetter && clampedPct < 100) {
    return Math.min((targetAmount / Math.max(currentAmount, 1)) * 100, 100);
  }
  return clampedPct;
};

function AnnualAmountRow({
  goal,
  currentAmount,
  targetAmount,
  lowerIsBetter,
  clampedPct,
  status,
}: Readonly<{
  goal: Goal;
  currentAmount: number;
  targetAmount: number;
  lowerIsBetter: boolean;
  clampedPct: number;
  status: GoalStatus;
}>) {
  return (
    <div className="flex items-end justify-between">
      <div>
        <p className="font-bold text-slate-900">
          {currentAmount}
          {goal.unit && (
            <span className="text-xs font-normal text-slate-400 ml-1">{goal.unit}</span>
          )}
        </p>
        <p className="text-xs text-slate-400">
          target: {targetAmount}
          {goal.unit ? ` ${goal.unit}` : ''}
        </p>
      </div>
      {lowerIsBetter && clampedPct < 100 && (
        <div className="flex items-center gap-1.5 text-xs text-amber-600">
          <AlertCircle size={12} />
          <span>
            Reduce by {Math.max(0, currentAmount - targetAmount)}
            {goal.unit || ''}
          </span>
        </div>
      )}
      {status === 'complete' && <p className="text-sm text-emerald-600 font-semibold">Done!</p>}
    </div>
  );
}

function GoalCardAnnual({
  goal,
  color,
  currentAmount,
  targetAmount,
  clampedPct,
  lowerIsBetter,
  status,
}: Readonly<{
  goal: Goal;
  color: string;
  currentAmount: number;
  targetAmount: number;
  clampedPct: number;
  lowerIsBetter: boolean;
  status: GoalStatus;
}>) {
  const barColor = lowerIsBetter && clampedPct < 100 ? '#f59e0b' : color;
  const barWidth = getAnnualBarWidth(lowerIsBetter, clampedPct, currentAmount, targetAmount);
  return (
    <>
      <div>
        <div className="flex justify-between mb-1.5">
          <span className="text-xs text-slate-500">
            Progress {goal.unit ? `(${goal.unit})` : ''}
          </span>
          <span className="text-xs font-semibold" style={{ color: barColor }}>
            {lowerIsBetter ? `${currentAmount} -> ${targetAmount}` : `${clampedPct.toFixed(0)}%`}
          </span>
        </div>
        <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{ width: `${barWidth}%`, backgroundColor: barColor }}
          />
        </div>
      </div>
      <AnnualAmountRow
        goal={goal}
        currentAmount={currentAmount}
        targetAmount={targetAmount}
        lowerIsBetter={lowerIsBetter}
        clampedPct={clampedPct}
        status={status}
      />
    </>
  );
}

// ─── GoalCard header + body ───────────────────────────────────────────────────

function GoalNameAndBadges({
  goal,
  status,
  meta,
}: Readonly<{ goal: Goal; status: GoalStatus; meta: GoalMeta }>) {
  const { Icon } = meta;
  const statusMeta = STATUS_META[status];
  return (
    <div className="flex items-start gap-3 min-w-0">
      <span className="text-2xl flex-shrink-0 leading-none mt-0.5">{goal.emoji}</span>
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="font-semibold text-slate-800 leading-tight">{goal.name}</p>
          {status === 'complete' && (
            <CheckCircle2 size={14} className="text-emerald-500 flex-shrink-0" />
          )}
        </div>
        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
          <span
            className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${statusMeta.color}`}
          >
            <span className={`inline-block w-1.5 h-1.5 rounded-full ${statusMeta.dot} mr-1`} />
            {statusMeta.label}
          </span>
          <span
            className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${meta.bg} ${meta.text}`}
          >
            <Icon size={10} className="inline-block mr-1" />
            {meta.label}
          </span>
        </div>
      </div>
    </div>
  );
}

function GoalCardHeader({
  goal,
  status,
  meta,
  onDelete,
}: Readonly<{
  goal: Goal;
  status: GoalStatus;
  meta: GoalMeta;
  onDelete: (id: number) => void;
}>) {
  return (
    <div className="px-5 pt-5 pb-4 flex items-start justify-between gap-3">
      <GoalNameAndBadges goal={goal} status={status} meta={meta} />
      <div className="flex items-center gap-1 flex-shrink-0">
        <span className="text-xs text-slate-400 mr-1">{`🗓 ${goal.deadline}`}</span>
        <button
          onClick={() => onDelete(goal.id)}
          className="p-1.5 rounded-lg hover:bg-rose-50 text-slate-300 hover:text-rose-500 transition-colors"
        >
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  );
}

type GoalBodyContentProps = {
  goal: Goal;
  type: GoalType;
  status: GoalStatus;
  color: string;
  clampedPct: number;
  annualGross: number;
  fmtBase: (n: number) => string;
  onUpdateMonths: (id: number, delta: number) => void;
};

const isSavingsLike = (type: GoalType) =>
  type === 'savings' || type === 'portfolio' || type === 'net_worth';
const getInvestHabitNums = (goal: Goal) => ({
  monthlyTarget: goal.monthlyTarget || 0,
  monthsCompleted: goal.monthsCompleted ?? 0,
  totalMonths: goal.totalMonths ?? 12,
});
const getGoalAmounts = (goal: Goal) => ({
  cur: goal.currentAmount || 0,
  tgt: goal.targetAmount || 0,
  monthlyContrib: goal.monthlyContribution || 0,
});

function renderAnnualGoal(props: GoalBodyContentProps) {
  const { goal, color, clampedPct, status } = props;
  const { cur, tgt } = getGoalAmounts(goal);
  return (
    <GoalCardAnnual
      goal={goal}
      color={color}
      currentAmount={cur}
      targetAmount={tgt}
      clampedPct={clampedPct}
      lowerIsBetter={goal.unit === '€/mo' && cur > tgt}
      status={status}
    />
  );
}

function renderGoalTypeContent(props: GoalBodyContentProps) {
  const { goal, type, status, color, clampedPct, annualGross, fmtBase, onUpdateMonths } = props;
  const { cur, tgt, monthlyContrib } = getGoalAmounts(goal);
  if (isSavingsLike(type))
    return (
      <GoalCardSavings
        color={color}
        currentAmount={cur}
        targetAmount={tgt}
        monthlyContrib={monthlyContrib}
        clampedPct={clampedPct}
        status={status}
        fmtBase={fmtBase}
      />
    );
  if (type === 'salary')
    return (
      <GoalCardSalary
        color={color}
        targetAmount={tgt}
        annualGross={annualGross}
        clampedPct={clampedPct}
        fmtBase={fmtBase}
      />
    );
  if (type === 'invest_habit') {
    const { monthlyTarget, monthsCompleted, totalMonths } = getInvestHabitNums(goal);
    return (
      <GoalCardInvestHabit
        goal={goal}
        color={color}
        monthlyTarget={monthlyTarget}
        monthsCompleted={monthsCompleted}
        totalMonths={totalMonths}
        status={status}
        fmtBase={fmtBase}
        onUpdateMonths={onUpdateMonths}
      />
    );
  }
  if (type === 'annual') return renderAnnualGoal(props);
  return null;
}

function GoalCardBody(props: Readonly<GoalBodyContentProps>) {
  return (
    <div className="px-5 pb-5 flex-1 flex flex-col gap-3">
      {renderGoalTypeContent(props)}
      {props.goal.notes && (
        <p className="text-[11px] text-slate-400 pt-3 border-t border-slate-50 leading-relaxed">
          {props.goal.notes}
        </p>
      )}
    </div>
  );
}

function GoalCard({ goal, annualGross, currentYear, onDelete, onUpdateMonths }: CardProps) {
  const { fmtBase } = useCurrency();
  const pct = getGoalPct(goal, annualGross);
  const status = getGoalStatus(goal, annualGross, currentYear);
  const type = normalizeGoalType(goal);
  const meta = GOAL_TYPE_META[type];
  const color = goal.color || '#6366f1';
  const clampedPct = Math.max(0, Math.min(pct, 100));

  return (
    <div
      className={`bg-white rounded-2xl border shadow-sm transition-all hover:shadow-md flex flex-col ${status === 'complete' ? 'border-emerald-200' : 'border-slate-100'}`}
    >
      <GoalCardHeader goal={goal} status={status} meta={meta} onDelete={onDelete} />
      <GoalCardBody
        goal={goal}
        type={type}
        status={status}
        color={color}
        clampedPct={clampedPct}
        annualGross={annualGross}
        fmtBase={fmtBase}
        onUpdateMonths={onUpdateMonths}
      />
    </div>
  );
}

// ─── Goals layout components ──────────────────────────────────────────────────

function GoalsHeader({
  years,
  activeYear,
  currentYear,
  stats,
  onYearChange,
}: Readonly<{
  years: readonly number[];
  activeYear: number;
  currentYear: number;
  stats: { total: number; completed: number; onTrack: number; atRisk: number; monthly: number };
  onYearChange: (year: number) => void;
}>) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {years.map((year) => (
        <button
          key={year}
          onClick={() => onYearChange(year)}
          className={`px-5 py-2 rounded-xl text-sm font-semibold transition-all ${year === activeYear ? 'bg-[#0a0f1e] text-white shadow-sm' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}
        >
          {year}
          {year === currentYear && <span className="ml-1.5 text-[10px] opacity-70">current</span>}
        </button>
      ))}
      <div className="flex-1" />
      <div className="flex items-center gap-1.5 text-xs text-slate-400 bg-white border border-slate-200 rounded-xl px-3 py-2">
        <Sparkles size={12} className="text-indigo-400" />
        {stats.total} goals - {stats.completed} completed - {stats.onTrack} on track
      </div>
    </div>
  );
}

const STAT_ICON_COLORS: Record<string, string> = {
  indigo: 'bg-indigo-50 text-indigo-600',
  emerald: 'bg-emerald-50 text-emerald-600',
  sky: 'bg-sky-50 text-sky-600',
  amber: 'bg-amber-50 text-amber-600',
};

type GoalStatsData = {
  total: number;
  completed: number;
  onTrack: number;
  atRisk: number;
  monthly: number;
};

function buildGoalStatCards(
  stats: GoalStatsData,
  activeYear: number,
  fmtBase: (n: number) => string,
) {
  return [
    {
      label: 'Total Goals',
      value: stats.total.toString(),
      sub: `${activeYear} plan`,
      icon: Target,
      color: 'indigo',
    },
    {
      label: 'On Track',
      value: stats.onTrack.toString(),
      sub: `${stats.atRisk} need attention`,
      icon: CheckCircle2,
      color: 'emerald',
    },
    {
      label: 'Monthly Commitment',
      value: fmtBase(stats.monthly),
      sub: 'Savings + invest habits',
      icon: Calendar,
      color: 'sky',
    },
    {
      label: 'Completed',
      value: stats.completed.toString(),
      sub: stats.completed > 0 ? 'Great work!' : '-',
      icon: Trophy,
      color: 'amber',
    },
  ] as const;
}

function GoalsStatsGrid({
  stats,
  activeYear,
  fmtBase,
}: Readonly<{ stats: GoalStatsData; activeYear: number; fmtBase: (n: number) => string }>) {
  const cards = buildGoalStatCards(stats, activeYear, fmtBase);
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map(({ label, value, sub, icon: Icon, color }) => (
        <div key={label} className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
          <div
            className={`w-10 h-10 rounded-xl mb-3 flex items-center justify-center ${STAT_ICON_COLORS[color]}`}
          >
            <Icon size={18} />
          </div>
          <p className="text-xs text-slate-500 mb-1">{label}</p>
          <p className="font-bold text-slate-900">{value}</p>
          <p className="text-xs text-slate-400 mt-1">{sub}</p>
        </div>
      ))}
    </div>
  );
}

function FilterCountBadge({
  filterKey,
  activeFilter,
  goals,
  activeYear,
  currentYear,
}: Readonly<{
  filterKey: FilterKey;
  activeFilter: FilterKey;
  goals: readonly Goal[];
  activeYear: number;
  currentYear: number;
}>) {
  const count = goals.filter(
    (goal) =>
      parseGoalYear(goal, currentYear) === activeYear &&
      GOAL_TYPE_META[normalizeGoalType(goal)].filterKey === filterKey,
  ).length;
  return (
    <span
      className={`text-[10px] px-1.5 py-0.5 rounded-full ${activeFilter === filterKey ? 'bg-white/20' : 'bg-slate-100'}`}
    >
      {count}
    </span>
  );
}

function GoalsFilterBar({
  activeFilter,
  activeYear,
  currentYear,
  goals,
  onFilterChange,
  onAdd,
}: Readonly<{
  activeFilter: FilterKey;
  activeYear: number;
  currentYear: number;
  goals: readonly Goal[];
  onFilterChange: (key: FilterKey) => void;
  onAdd: () => void;
}>) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-xl p-1 flex-wrap">
        {FILTERS.map(({ key, label, Icon }) => (
          <button
            key={key}
            onClick={() => onFilterChange(key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${activeFilter === key ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50'}`}
          >
            <Icon size={13} /> {label}
            {key !== 'all' && (
              <FilterCountBadge
                filterKey={key}
                activeFilter={activeFilter}
                goals={goals}
                activeYear={activeYear}
                currentYear={currentYear}
              />
            )}
          </button>
        ))}
      </div>
      <div className="flex-1" />
      <button
        onClick={onAdd}
        className="flex items-center gap-2 text-sm bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-xl transition-colors"
      >
        <Plus size={15} /> Add Goal
      </button>
    </div>
  );
}

function GlanceItem({
  goal,
  annualGross,
  currentYear,
}: Readonly<{ goal: Goal; annualGross: number; currentYear: number }>) {
  const pct = getGoalPct(goal, annualGross);
  const status = getGoalStatus(goal, annualGross, currentYear);
  const type = normalizeGoalType(goal);
  return (
    <div className="group flex items-center gap-3">
      <span className="text-base w-7 text-center flex-shrink-0">{goal.emoji}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-medium text-slate-700 truncate">{goal.name}</span>
          <span className="text-xs font-semibold text-slate-500 flex-shrink-0 ml-2">
            {type === 'invest_habit'
              ? `${goal.monthsCompleted ?? 0}/${goal.totalMonths ?? 12}mo`
              : `${pct.toFixed(0)}%`}
          </span>
        </div>
        <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{
              width: `${Math.max(0, Math.min(pct, 100))}%`,
              backgroundColor: goal.color || '#6366f1',
            }}
          />
        </div>
      </div>
      <span
        className={`text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${STATUS_META[status].color}`}
      >
        {STATUS_META[status].label}
      </span>
    </div>
  );
}

function GoalsGlance({
  yearGoals,
  annualGross,
  currentYear,
  activeYear,
}: Readonly<{
  yearGoals: readonly Goal[];
  annualGross: number;
  currentYear: number;
  activeYear: number;
}>) {
  return (
    <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
      <h3 className="font-semibold text-slate-900 mb-1">{activeYear} Goals at a Glance</h3>
      <p className="text-xs text-slate-400 mb-5">All goals sorted by progress</p>
      <div className="space-y-3">
        {[...yearGoals]
          .sort((a, b) => getGoalPct(b, annualGross) - getGoalPct(a, annualGross))
          .map((goal) => (
            <GlanceItem
              key={goal.id}
              goal={goal}
              annualGross={annualGross}
              currentYear={currentYear}
            />
          ))}
      </div>
    </div>
  );
}

function GoalsEmptyState({
  activeFilter,
  activeYear,
  onAdd,
}: Readonly<{ activeFilter: FilterKey; activeYear: number; onAdd: () => void }>) {
  return (
    <div className="bg-white rounded-2xl border border-dashed border-slate-200 p-12 text-center">
      <div className="w-14 h-14 rounded-2xl bg-slate-50 flex items-center justify-center mx-auto mb-4">
        <Target size={22} className="text-slate-300" />
      </div>
      <p className="font-semibold text-slate-500 mb-1">
        No {activeFilter !== 'all' ? `${activeFilter} ` : ''}goals for {activeYear}
      </p>
      <p className="text-sm text-slate-400 mb-4">
        Add a goal to start tracking your financial progress.
      </p>
      <button
        onClick={onAdd}
        className="inline-flex items-center gap-2 text-sm bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl transition-colors"
      >
        <Plus size={14} /> Add Your First Goal
      </button>
    </div>
  );
}

// ─── Goals (main) ─────────────────────────────────────────────────────────────

const computeGoalStats = (yearGoals: readonly Goal[], annualGross: number, currentYear: number) => {
  const count = (s: string) =>
    yearGoals.filter((g) => getGoalStatus(g, annualGross, currentYear) === s).length;
  const monthly = yearGoals.reduce(
    (sum, g) => sum + (g.monthlyContribution || g.monthlyTarget || 0),
    0,
  );
  return {
    total: yearGoals.length,
    completed: count('complete'),
    onTrack: count('on_track'),
    atRisk: count('at_risk'),
    monthly,
  };
};

const computeGoalYears = (goals: readonly Goal[], currentYear: number): number[] => {
  const uniqueYears = new Set<number>();
  for (const goal of goals) uniqueYears.add(parseGoalYear(goal, currentYear));
  uniqueYears.add(currentYear);
  return [...uniqueYears].sort((a, b) => a - b);
};

type GoalsComputations = {
  annualGross: number;
  years: number[];
  yearGoals: Goal[];
  filteredGoals: Goal[];
  stats: ReturnType<typeof computeGoalStats>;
};

function useGoalsComputations(
  goals: Goal[],
  payslips: { gross: number; date: string }[],
  currentYear: number,
  activeYear: number,
  activeFilter: FilterKey,
  setActiveYear: (y: number) => void,
): GoalsComputations {
  const annualGross = useMemo(() => {
    if (payslips.length === 0) return 0;
    const latest = [...payslips].sort((a, b) => b.date.localeCompare(a.date))[0];
    return (latest?.gross ?? 0) * 12;
  }, [payslips]);
  const years = useMemo(() => computeGoalYears(goals, currentYear), [goals, currentYear]);
  useEffect(() => {
    if (!years.includes(activeYear)) setActiveYear(years[years.length - 1] ?? currentYear);
  }, [activeYear, years, currentYear, setActiveYear]);
  const yearGoals = useMemo(
    () => goals.filter((goal) => parseGoalYear(goal, currentYear) === activeYear),
    [goals, activeYear, currentYear],
  );
  const filteredGoals = useMemo(
    () =>
      goals.filter((goal) => {
        if (parseGoalYear(goal, currentYear) !== activeYear) return false;
        return (
          activeFilter === 'all' ||
          GOAL_TYPE_META[normalizeGoalType(goal)].filterKey === activeFilter
        );
      }),
    [goals, activeYear, activeFilter, currentYear],
  );
  const stats = useMemo(
    () => computeGoalStats(yearGoals, annualGross, currentYear),
    [yearGoals, annualGross, currentYear],
  );
  return { annualGross, years, yearGoals, filteredGoals, stats };
}

function useGoalsPage() {
  const { fmtBase } = useCurrency();
  const { data: goals = [], isLoading: loadingGoals } = useGoals();
  const { data: payslips = [], isLoading: loadingPayslips } = usePayslips();
  const createGoal = useCreateGoal();
  const updateGoal = useUpdateGoal();
  const deleteGoal = useDeleteGoal();
  const currentYear = new Date().getFullYear();
  const [activeYear, setActiveYear] = useState(currentYear);
  const [activeFilter, setActiveFilter] = useState<FilterKey>('all');
  const [showAdd, setShowAdd] = useState(false);
  const { annualGross, years, yearGoals, filteredGoals, stats } = useGoalsComputations(
    goals,
    payslips,
    currentYear,
    activeYear,
    activeFilter,
    setActiveYear,
  );

  const handleDelete = (id: number) => {
    deleteGoal.mutate(id);
  };
  const handleAddGoal = (goal: Omit<Goal, 'id'>) => {
    createGoal.mutate(goal);
  };
  const handleUpdateMonths = (id: number, delta: number) => {
    const goal = goals.find((g) => g.id === id);
    if (goal)
      updateGoal.mutate({
        id,
        monthsCompleted: Math.max(
          0,
          Math.min((goal.monthsCompleted ?? 0) + delta, goal.totalMonths ?? 12),
        ),
      });
  };

  return {
    fmtBase,
    goals,
    loadingGoals,
    loadingPayslips,
    currentYear,
    activeYear,
    setActiveYear,
    activeFilter,
    setActiveFilter,
    showAdd,
    setShowAdd,
    annualGross,
    years,
    yearGoals,
    filteredGoals,
    stats,
    handleDelete,
    handleUpdateMonths,
    handleAddGoal,
  };
}

type GoalsPageState = ReturnType<typeof useGoalsPage>;

type GoalsCardGridProps = {
  filteredGoals: Goal[];
  annualGross: number;
  currentYear: number;
  activeFilter: FilterKey;
  activeYear: number;
  yearGoals: Goal[];
  onDelete: (id: number) => void;
  onUpdateMonths: (id: number, delta: number) => void;
  onAdd: () => void;
};

function GoalsCardGrid({
  filteredGoals,
  annualGross,
  currentYear,
  activeFilter,
  activeYear,
  yearGoals,
  onDelete,
  onUpdateMonths,
  onAdd,
}: Readonly<GoalsCardGridProps>) {
  if (filteredGoals.length === 0) {
    return <GoalsEmptyState activeFilter={activeFilter} activeYear={activeYear} onAdd={onAdd} />;
  }
  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {filteredGoals.map((goal) => (
          <GoalCard
            key={goal.id}
            goal={goal}
            annualGross={annualGross}
            currentYear={currentYear}
            onDelete={onDelete}
            onUpdateMonths={onUpdateMonths}
          />
        ))}
      </div>
      <GoalsGlance
        yearGoals={yearGoals}
        annualGross={annualGross}
        currentYear={currentYear}
        activeYear={activeYear}
      />
    </>
  );
}

function GoalsMainContent({ state }: Readonly<{ state: GoalsPageState }>) {
  return (
    <div className="p-6 space-y-6">
      {state.showAdd && (
        <AddGoalModal onClose={() => state.setShowAdd(false)} onSave={state.handleAddGoal} />
      )}
      <GoalsHeader
        years={state.years}
        activeYear={state.activeYear}
        currentYear={state.currentYear}
        stats={state.stats}
        onYearChange={state.setActiveYear}
      />
      <GoalsStatsGrid stats={state.stats} activeYear={state.activeYear} fmtBase={state.fmtBase} />
      <GoalsFilterBar
        activeFilter={state.activeFilter}
        activeYear={state.activeYear}
        currentYear={state.currentYear}
        goals={state.goals}
        onFilterChange={state.setActiveFilter}
        onAdd={() => state.setShowAdd(true)}
      />
      <GoalsCardGrid
        filteredGoals={state.filteredGoals}
        annualGross={state.annualGross}
        currentYear={state.currentYear}
        activeFilter={state.activeFilter}
        activeYear={state.activeYear}
        yearGoals={state.yearGoals}
        onDelete={state.handleDelete}
        onUpdateMonths={state.handleUpdateMonths}
        onAdd={() => state.setShowAdd(true)}
      />
    </div>
  );
}

export function Goals() {
  const state = useGoalsPage();

  if (state.loadingGoals || state.loadingPayslips) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
      </div>
    );
  }

  return <GoalsMainContent state={state} />;
}
