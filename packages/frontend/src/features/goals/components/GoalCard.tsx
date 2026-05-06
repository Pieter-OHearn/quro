import { AlertCircle, ArrowUpRight, Check, CheckCircle2, Minus, Trash2 } from 'lucide-react';
import { useCurrency } from '@/lib/CurrencyContext';
import type { Goal, GoalType } from '@quro/shared';
import type { GoalMeta, GoalProgressContext, GoalStatus } from '../types';
import { GOAL_TYPE_META, MONTHS, STATUS_META } from '../utils/goals-constants';
import {
  getGoalPct,
  getGoalStatus,
  normalizeGoalType,
  normalizeGoalSourceType,
  resolveGoalCurrentAmount,
  resolveInvestHabitMonthsCompleted,
  type GoalCurrentAmountResolution,
} from '../utils/goal-utils';

const PREVIOUS_MONTH_DELTA = -1;
const NEXT_MONTH_DELTA = 1;

type GoalCardProps = {
  goal: Goal;
  goalProgressContext: GoalProgressContext;
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
        onClick={() => onUpdateMonths(goalId, PREVIOUS_MONTH_DELTA)}
        disabled={monthsCompleted <= 0}
        className="w-7 h-7 rounded-lg border border-slate-200 flex items-center justify-center hover:bg-slate-50 disabled:opacity-30 transition-colors"
      >
        <Minus size={11} />
      </button>
      <span className="text-xs text-slate-500 px-1">{monthsCompleted}</span>
      <button
        onClick={() => onUpdateMonths(goalId, NEXT_MONTH_DELTA)}
        disabled={monthsCompleted >= totalMonths}
        className="w-7 h-7 rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-600 flex items-center justify-center hover:bg-indigo-100 disabled:opacity-30 transition-colors"
      >
        <Check size={11} />
      </button>
    </div>
  );
}

type InvestHabitCardProps = {
  goal: Goal;
  color: string;
  monthlyTarget: number;
  monthsCompleted: number;
  totalMonths: number;
  status: GoalStatus;
  fmtBase: (n: number) => string;
  onUpdateMonths: (id: number, delta: number) => void;
  isLinked: boolean;
};

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
  isLinked,
}: Readonly<InvestHabitCardProps>) {
  return (
    <>
      <InvestHabitProgress
        color={color}
        monthlyTarget={monthlyTarget}
        monthsCompleted={monthsCompleted}
        totalMonths={totalMonths}
        fmtBase={fmtBase}
      />
      {status !== 'complete' && !isLinked && (
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

function GoalNameAndBadges({
  goal,
  status,
  meta,
  sourceResolution,
}: Readonly<{
  goal: Goal;
  status: GoalStatus;
  meta: GoalMeta;
  sourceResolution: GoalCurrentAmountResolution;
}>) {
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
          {sourceResolution.status !== 'manual' && (
            <span
              className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                sourceResolution.status === 'linked'
                  ? 'bg-emerald-50 text-emerald-700'
                  : 'bg-amber-50 text-amber-700'
              }`}
            >
              <Link2Icon status={sourceResolution.status} />
              {sourceResolution.status === 'linked' ? sourceResolution.label : 'Source unavailable'}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function Link2Icon({ status }: Readonly<{ status: GoalCurrentAmountResolution['status'] }>) {
  return (
    <span
      className={`mr-1 inline-block h-1.5 w-1.5 rounded-full ${
        status === 'linked' ? 'bg-emerald-500' : 'bg-amber-500'
      }`}
    />
  );
}

function GoalCardHeader({
  goal,
  status,
  meta,
  sourceResolution,
  onDelete,
}: Readonly<{
  goal: Goal;
  status: GoalStatus;
  meta: GoalMeta;
  sourceResolution: GoalCurrentAmountResolution;
  onDelete: (id: number) => void;
}>) {
  return (
    <div className="px-5 pt-5 pb-4 flex items-start justify-between gap-3">
      <GoalNameAndBadges
        goal={goal}
        status={status}
        meta={meta}
        sourceResolution={sourceResolution}
      />
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
  currentAmount: number;
  annualGross: number;
  goalProgressContext: GoalProgressContext;
  fmtBase: (n: number) => string;
  toBase: (n: number) => number;
  onUpdateMonths: (id: number, delta: number) => void;
};

const isSavingsLike = (type: GoalType) =>
  type === 'savings' || type === 'portfolio' || type === 'net_worth';

const getInvestHabitNumbers = (goal: Goal) => ({
  monthlyTarget: goal.monthlyTarget || 0,
  monthsCompleted: goal.monthsCompleted ?? 0,
  totalMonths: goal.totalMonths ?? 12,
});

const getGoalAmounts = (goal: Goal, currentAmount: number, toBase: (n: number) => number) => ({
  currentAmount,
  targetAmount: toBase(goal.targetAmount || 0),
  monthlyContrib: toBase(goal.monthlyContribution || 0),
});

function renderAnnualGoal(props: GoalBodyContentProps) {
  const { goal, color, clampedPct, status, currentAmount, toBase } = props;
  const { targetAmount } = getGoalAmounts(goal, currentAmount, toBase);

  return (
    <GoalCardAnnual
      goal={goal}
      color={color}
      currentAmount={currentAmount}
      targetAmount={targetAmount}
      clampedPct={clampedPct}
      lowerIsBetter={Boolean(goal.unit?.endsWith('/mo')) && currentAmount > targetAmount}
      status={status}
    />
  );
}

function renderGoalTypeContent(props: GoalBodyContentProps) {
  const {
    goal,
    type,
    status,
    color,
    clampedPct,
    currentAmount,
    annualGross,
    goalProgressContext,
    fmtBase,
    toBase,
    onUpdateMonths,
  } = props;
  const { targetAmount, monthlyContrib } = getGoalAmounts(goal, currentAmount, toBase);

  if (isSavingsLike(type)) {
    return (
      <GoalCardSavings
        color={color}
        currentAmount={currentAmount}
        targetAmount={targetAmount}
        monthlyContrib={monthlyContrib}
        clampedPct={clampedPct}
        status={status}
        fmtBase={fmtBase}
      />
    );
  }

  if (type === 'salary') {
    return (
      <GoalCardSalary
        color={color}
        targetAmount={targetAmount}
        annualGross={annualGross}
        clampedPct={clampedPct}
        fmtBase={fmtBase}
      />
    );
  }

  if (type === 'invest_habit') {
    const { monthlyTarget, totalMonths } = getInvestHabitNumbers(goal);
    const monthsCompleted = resolveInvestHabitMonthsCompleted(goal, goalProgressContext);
    const isLinked = normalizeGoalSourceType(goal) === 'invest_habit_buys';

    return (
      <GoalCardInvestHabit
        goal={goal}
        color={color}
        monthlyTarget={toBase(monthlyTarget)}
        monthsCompleted={monthsCompleted}
        totalMonths={totalMonths}
        status={status}
        fmtBase={fmtBase}
        onUpdateMonths={onUpdateMonths}
        isLinked={isLinked}
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

export function GoalCard({
  goal,
  goalProgressContext,
  currentYear,
  onDelete,
  onUpdateMonths,
}: Readonly<GoalCardProps>) {
  const { fmtBase, convertToBase } = useCurrency();
  const toBase = (n: number) => convertToBase(n, goal.currency);

  const sourceResolution = resolveGoalCurrentAmount(goal, goalProgressContext);
  const pct = getGoalPct(goal, goalProgressContext);
  const status = getGoalStatus(goal, goalProgressContext, currentYear);
  const type = normalizeGoalType(goal);
  const meta = GOAL_TYPE_META[type];
  const color = goal.color || '#6366f1';
  const clampedPct = Math.max(0, Math.min(pct, 100));

  return (
    <div
      className={`bg-white rounded-2xl border shadow-sm transition-all hover:shadow-md flex flex-col ${status === 'complete' ? 'border-emerald-200' : 'border-slate-100'}`}
    >
      <GoalCardHeader
        goal={goal}
        status={status}
        meta={meta}
        sourceResolution={sourceResolution}
        onDelete={onDelete}
      />
      <GoalCardBody
        goal={goal}
        type={type}
        status={status}
        color={color}
        clampedPct={clampedPct}
        currentAmount={sourceResolution.currentAmount}
        annualGross={goalProgressContext.annualGross}
        goalProgressContext={goalProgressContext}
        fmtBase={fmtBase}
        toBase={toBase}
        onUpdateMonths={onUpdateMonths}
      />
    </div>
  );
}
