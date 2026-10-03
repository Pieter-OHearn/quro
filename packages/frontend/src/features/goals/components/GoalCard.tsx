import {
  AlertCircle,
  ArrowUpRight,
  Check,
  CheckCircle2,
  Minus,
  Pencil,
  Trash2,
} from 'lucide-react';
import { useCurrency } from '@/lib/CurrencyContext';
import {
  getMonthAbbreviationIndex,
  MONTH_ABBREVIATIONS,
  type Goal,
  type GoalType,
  formatPercent,
} from '@quro/shared';
import type { GoalMeta, GoalProgressContext, GoalStatus } from '../types';
import { GOAL_TYPE_META, STATUS_META } from '../utils/goals-constants';
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
  onEdit: (id: number) => void;
  onUpdateMonths: (id: number, delta: number) => void;
  onToggleMissedMonth: (id: number, monthKey: string) => void;
};

function ProgressBar({ pct, color }: Readonly<{ pct: number; color: string }>) {
  return (
    <div className="w-full h-2.5 bg-surface-muted rounded-full overflow-hidden">
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
        <p className="font-bold text-fg">{fmtBase(currentAmount)}</p>
        <p className="text-xs text-fg-faint">of {fmtBase(targetAmount)}</p>
      </div>
      {status !== 'complete' && (
        <div className="text-right">
          <p className="text-xs text-fg-subtle">{fmtBase(remaining)} to go</p>
          {monthlyContrib > 0 && (
            <p className="text-xs text-fg-faint">
              ~{Math.ceil(remaining / monthlyContrib)}mo at {fmtBase(monthlyContrib)}/mo
            </p>
          )}
        </div>
      )}
      {status === 'complete' && <p className="text-sm text-success font-semibold">Done!</p>}
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
          <span className="text-xs text-fg-subtle">Progress</span>
          <span className="text-xs font-semibold" style={{ color }}>
            {formatPercent(clampedPct, 0)}
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
      <div className="bg-surface-sunken rounded-xl px-3 py-2.5">
        <p className="text-[10px] text-fg-faint mb-0.5">Current Gross</p>
        <p className="font-bold text-fg-emphasis">
          {fmtBase(annualGross)}
          <span className="text-xs font-normal text-fg-faint">/yr</span>
        </p>
      </div>
      <div
        className="rounded-xl px-3 py-2.5"
        style={{ backgroundColor: `color-mix(in srgb, ${color} 9.4118%, transparent)` }}
      >
        <p className="text-[10px] text-fg-faint mb-0.5">Target Gross</p>
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
          <span className="text-xs text-fg-subtle">Current - Target</span>
          <span className="text-xs font-semibold" style={{ color }}>
            {formatPercent(clampedPct, 0)}
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
        <ArrowUpRight size={13} className="text-success-accent flex-shrink-0" />
        <p className="text-xs text-fg-muted">
          {annualGross > 0 ? (
            <>
              <strong>{formatPercent((targetAmount / annualGross - 1) * 100, 1)} raise</strong> -{' '}
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

function buildMonthRange(startDeadline: string, endDeadline: string): string[] {
  const parse = (d: string) => {
    const m = d.match(/^([A-Za-z]+)\s+(\d{4})$/);
    if (!m) return null;
    const mo = getMonthAbbreviationIndex(m[1]);
    return mo === -1 ? null : { year: Number(m[2]), month: mo };
  };
  const s = parse(startDeadline);
  const e = parse(endDeadline);
  if (!s || !e) return [];
  const keys: string[] = [];
  let { year, month } = s;
  while (year < e.year || (year === e.year && month <= e.month)) {
    keys.push(`${year}-${String(month + 1).padStart(2, '0')}`);
    month++;
    if (month > 11) {
      month = 0;
      year++;
    }
  }
  return keys;
}

function monthCellTitle(done: boolean, missed: boolean, isFuture: boolean): string {
  if (done) return 'Completed';
  if (missed) return 'Missed (click to unmark)';
  if (isFuture) return 'Future';
  return 'Mark as missed';
}

function monthCellBg(done: boolean, missed: boolean, isFuture: boolean, color: string): string {
  if (done) return color;
  if (missed) return 'var(--data-forecast)';
  if (isFuture) return 'var(--border-subtle)';
  return 'var(--border-default)';
}

function CalendarMonthGrid({
  monthKeys,
  completedKeys,
  missedMonths,
  color,
  onToggle,
}: Readonly<{
  monthKeys: string[];
  completedKeys: ReadonlySet<string>;
  missedMonths: readonly string[];
  color: string;
  onToggle: (monthKey: string) => void;
}>) {
  const now = new Date();
  const currentKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  return (
    <div
      className="grid gap-px"
      style={{ gridTemplateColumns: `repeat(${Math.min(monthKeys.length, 12)}, 1fr)` }}
    >
      {monthKeys.map((key) => {
        const done = completedKeys.has(key);
        const missed = missedMonths.includes(key);
        const isFuture = key > currentKey;
        const label = MONTH_ABBREVIATIONS[Number(key.split('-')[1]) - 1]?.[0] ?? '';
        return (
          <div key={key} className="flex flex-col items-center gap-1">
            <button
              type="button"
              disabled={done || isFuture}
              onClick={() => !done && !isFuture && onToggle(key)}
              title={monthCellTitle(done, missed, isFuture)}
              className={`w-full aspect-square rounded-sm transition-all ${isFuture || done ? 'cursor-default' : 'cursor-pointer hover:opacity-70'}`}
              style={{ backgroundColor: monthCellBg(done, missed, isFuture, color) }}
            />
            <span className="text-[8px] text-fg-faint leading-none">{label}</span>
          </div>
        );
      })}
    </div>
  );
}

function InvestHabitMonthGrid({
  totalMonths,
  monthsCompleted,
  color,
}: Readonly<{ totalMonths: number; monthsCompleted: number; color: string }>) {
  return (
    <div className="grid grid-cols-12 gap-px">
      {MONTH_ABBREVIATIONS.slice(0, Math.max(1, Math.min(totalMonths, 12))).map((month, index) => {
        const done = index < monthsCompleted;
        return (
          <div key={month} className="flex flex-col items-center gap-1">
            <div
              className={`w-full aspect-square rounded-sm transition-all ${done ? '' : 'bg-surface-muted'}`}
              style={done ? { backgroundColor: color } : undefined}
            />
            <span className="text-[8px] text-fg-faint leading-none">{month[0]}</span>
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
        className="w-7 h-7 rounded-lg border border-border-default flex items-center justify-center hover:bg-surface-sunken disabled:opacity-30 transition-colors"
      >
        <Minus size={11} />
      </button>
      <span className="text-xs text-fg-subtle px-1">{monthsCompleted}</span>
      <button
        onClick={() => onUpdateMonths(goalId, NEXT_MONTH_DELTA)}
        disabled={monthsCompleted >= totalMonths}
        className="w-7 h-7 rounded-lg border border-brand-tint bg-brand-soft text-brand flex items-center justify-center hover:bg-brand-soft-strong disabled:opacity-30 transition-colors"
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
  onToggleMissedMonth: (id: number, monthKey: string) => void;
  isLinked: boolean;
  completedMonthKeys: ReadonlySet<string>;
};

function InvestHabitProgress({
  goal,
  color,
  monthlyTarget,
  monthsCompleted,
  totalMonths,
  fmtBase,
  completedMonthKeys,
  onToggleMissedMonth,
}: Readonly<
  Pick<
    InvestHabitCardProps,
    | 'color'
    | 'monthlyTarget'
    | 'monthsCompleted'
    | 'totalMonths'
    | 'fmtBase'
    | 'completedMonthKeys'
    | 'onToggleMissedMonth'
  > & { goal: Goal }
>) {
  const monthKeys =
    goal.startMonth && goal.deadline ? buildMonthRange(goal.startMonth, goal.deadline) : null;

  return (
    <div>
      <div className="flex justify-between mb-2">
        <span className="text-xs text-fg-subtle">Monthly hits</span>
        <span className="text-xs font-semibold" style={{ color }}>
          {monthsCompleted}/{totalMonths} months
        </span>
      </div>
      {monthKeys ? (
        <CalendarMonthGrid
          monthKeys={monthKeys}
          completedKeys={completedMonthKeys}
          missedMonths={goal.missedMonths ?? []}
          color={color}
          onToggle={(key) => onToggleMissedMonth(goal.id, key)}
        />
      ) : (
        <InvestHabitMonthGrid
          totalMonths={totalMonths}
          monthsCompleted={monthsCompleted}
          color={color}
        />
      )}
      <div className="mt-3">
        <p className="font-bold text-fg">{fmtBase(monthlyTarget * monthsCompleted)}</p>
        <p className="text-xs text-fg-faint">
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
  onToggleMissedMonth,
  isLinked,
  completedMonthKeys,
}: Readonly<InvestHabitCardProps>) {
  return (
    <>
      <InvestHabitProgress
        goal={goal}
        color={color}
        monthlyTarget={monthlyTarget}
        monthsCompleted={monthsCompleted}
        totalMonths={totalMonths}
        fmtBase={fmtBase}
        completedMonthKeys={completedMonthKeys}
        onToggleMissedMonth={onToggleMissedMonth}
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
        <p className="font-bold text-fg">
          {currentAmount}
          {goal.unit && <span className="text-xs font-normal text-fg-faint ml-1">{goal.unit}</span>}
        </p>
        <p className="text-xs text-fg-faint">
          target: {targetAmount}
          {goal.unit ? ` ${goal.unit}` : ''}
        </p>
      </div>
      {lowerIsBetter && clampedPct < 100 && (
        <div className="flex items-center gap-1.5 text-xs text-warning">
          <AlertCircle size={12} />
          <span>
            Reduce by {Math.max(0, currentAmount - targetAmount)}
            {goal.unit || ''}
          </span>
        </div>
      )}
      {status === 'complete' && <p className="text-sm text-success font-semibold">Done!</p>}
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
  const barColor = lowerIsBetter && clampedPct < 100 ? 'var(--data-forecast)' : color;
  const barWidth = getAnnualBarWidth(lowerIsBetter, clampedPct, currentAmount, targetAmount);
  return (
    <>
      <div>
        <div className="flex justify-between mb-1.5">
          <span className="text-xs text-fg-subtle">
            Progress {goal.unit ? `(${goal.unit})` : ''}
          </span>
          <span className="text-xs font-semibold" style={{ color: barColor }}>
            {lowerIsBetter ? `${currentAmount} -> ${targetAmount}` : formatPercent(clampedPct, 0)}
          </span>
        </div>
        <div className="w-full h-2.5 bg-surface-muted rounded-full overflow-hidden">
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
          <p className="font-semibold text-fg-emphasis leading-tight">{goal.name}</p>
          {status === 'complete' && (
            <CheckCircle2 size={14} className="text-success-accent flex-shrink-0" />
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
                  ? 'bg-success-soft text-success-fg'
                  : 'bg-warning-soft text-warning-fg'
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
        status === 'linked' ? 'bg-success-accent' : 'bg-warning-accent'
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
  onEdit,
}: Readonly<{
  goal: Goal;
  status: GoalStatus;
  meta: GoalMeta;
  sourceResolution: GoalCurrentAmountResolution;
  onDelete: (id: number) => void;
  onEdit: (id: number) => void;
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
        <span className="text-xs text-fg-faint mr-1">{`🗓 ${goal.deadline}`}</span>
        <button
          onClick={() => onEdit(goal.id)}
          className="p-1.5 rounded-lg hover:bg-brand-soft text-fg-disabled hover:text-brand-accent transition-colors"
        >
          <Pencil size={13} />
        </button>
        <button
          onClick={() => onDelete(goal.id)}
          className="p-1.5 rounded-lg hover:bg-danger-soft text-fg-disabled hover:text-danger transition-colors"
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
  onToggleMissedMonth: (id: number, monthKey: string) => void;
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
    onToggleMissedMonth,
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
    const year = goal.year ?? new Date().getFullYear();
    const completedMonthKeys = isLinked
      ? (goalProgressContext.investHabitBuyMonths.get(year) ?? new Set<string>())
      : new Set<string>();

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
        onToggleMissedMonth={onToggleMissedMonth}
        isLinked={isLinked}
        completedMonthKeys={completedMonthKeys}
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
        <p className="text-[11px] text-fg-faint pt-3 border-t border-surface-sunken leading-relaxed">
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
  onEdit,
  onUpdateMonths,
  onToggleMissedMonth,
}: Readonly<GoalCardProps>) {
  const { fmtBase, convertToBase } = useCurrency();
  const toBase = (n: number) => convertToBase(n, goal.currency);

  const sourceResolution = resolveGoalCurrentAmount(goal, goalProgressContext);
  const pct = getGoalPct(goal, goalProgressContext);
  const status = getGoalStatus(goal, goalProgressContext, currentYear);
  const type = normalizeGoalType(goal);
  const meta = GOAL_TYPE_META[type];
  const color = goal.color || 'var(--data-primary)';
  const clampedPct = Math.max(0, Math.min(pct, 100));

  return (
    <div
      className={`bg-surface rounded-2xl border shadow-sm transition-all hover:shadow-md flex flex-col ${status === 'complete' ? 'border-success-border' : 'border-border-subtle'}`}
    >
      <GoalCardHeader
        goal={goal}
        status={status}
        meta={meta}
        sourceResolution={sourceResolution}
        onDelete={onDelete}
        onEdit={onEdit}
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
        onToggleMissedMonth={onToggleMissedMonth}
      />
    </div>
  );
}
