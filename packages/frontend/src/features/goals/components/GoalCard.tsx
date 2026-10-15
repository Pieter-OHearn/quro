import {
  AlertCircle,
  ArrowUpRight,
  Check,
  CalendarDays,
  CheckCircle2,
  Minus,
  Pencil,
  Trash2,
} from 'lucide-react';
import { Badge, Card, IconButton, ProgressMeter } from '@/components/ui';
import { useCurrency } from '@/lib/CurrencyContext';
import { DATA_COLORS, dataColorToken } from '@/lib/dataColors';
import { cn } from '@/lib/utils';
import {
  getMonthAbbreviationIndex,
  MONTH_ABBREVIATIONS,
  type Goal,
  type GoalType,
  formatPercent,
} from '@quro/shared';
import type { GoalMeta, GoalProgressContext, GoalStatus } from '../types';
import { GOAL_CHIP_CLASS_NAME, GOAL_TYPE_META, STATUS_META } from '../utils/goals-constants';
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

// Goal meters are lilac `secondary`, the colour that marks goals.
function ProgressBar({ pct, label }: Readonly<{ pct: number; label: string }>) {
  return <ProgressMeter value={pct} label={label} />;
}

const LABEL = 'text-label text-fg-muted';
const FIGURE = 'text-label font-numeric text-fg';
const CAPTION = 'text-caption text-fg-subtle';
const DONE = 'text-cell font-medium text-success';

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
        <p className="text-figure-md font-numeric text-fg">{fmtBase(currentAmount)}</p>
        <p className={CAPTION}>of {fmtBase(targetAmount)}</p>
      </div>
      {status !== 'complete' && (
        <div className="text-right font-numeric">
          <p className="text-caption text-fg-muted">{fmtBase(remaining)} to go</p>
          {monthlyContrib > 0 && (
            <p className={CAPTION}>
              ~{Math.ceil(remaining / monthlyContrib)}mo at {fmtBase(monthlyContrib)}/mo
            </p>
          )}
        </div>
      )}
      {status === 'complete' && <p className={DONE}>Done!</p>}
    </div>
  );
}

function GoalCardSavings({
  currentAmount,
  targetAmount,
  monthlyContrib,
  clampedPct,
  status,
  fmtBase,
}: Readonly<{
  currentAmount: number;
  targetAmount: number;
  monthlyContrib: number;
  clampedPct: number;
  status: GoalStatus;
  fmtBase: (n: number) => string;
}>) {
  const { numberFormat } = useCurrency();
  return (
    <>
      <div>
        <div className="mb-1 flex justify-between">
          <span className={LABEL}>Progress</span>
          <span className={FIGURE}>{formatPercent(clampedPct, numberFormat, 0)}</span>
        </div>
        <ProgressBar pct={clampedPct} label="Goal progress" />
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
  targetAmount,
  annualGross,
  fmtBase,
}: Readonly<{
  targetAmount: number;
  annualGross: number;
  fmtBase: (n: number) => string;
}>) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <div className="rounded-md bg-surface-sunken px-3 py-2">
        <p className={LABEL}>Current gross</p>
        <p className="text-figure-md font-numeric text-fg">
          {fmtBase(annualGross)}
          <span className={CAPTION}>/yr</span>
        </p>
      </div>
      <div className="rounded-md bg-secondary-soft px-3 py-2">
        <p className={LABEL}>Target gross</p>
        <p className="text-figure-md font-numeric text-secondary">
          {fmtBase(targetAmount)}
          <span className="text-caption">/yr</span>
        </p>
      </div>
    </div>
  );
}

function GoalCardSalary({
  targetAmount,
  annualGross,
  clampedPct,
  fmtBase,
}: Readonly<{
  targetAmount: number;
  annualGross: number;
  clampedPct: number;
  fmtBase: (n: number) => string;
}>) {
  const { numberFormat } = useCurrency();
  return (
    <>
      <div>
        <div className="mb-1 flex justify-between">
          <span className={LABEL}>Current - target</span>
          <span className={FIGURE}>{formatPercent(clampedPct, numberFormat, 0)}</span>
        </div>
        <ProgressBar pct={clampedPct} label="Goal progress" />
      </div>
      <SalaryComparisonGrid
        targetAmount={targetAmount}
        annualGross={annualGross}
        fmtBase={fmtBase}
      />
      <div className="flex items-center gap-2">
        <ArrowUpRight size={13} className="shrink-0 text-fg-faint" aria-hidden />
        <p className="text-caption text-fg-muted font-numeric">
          {annualGross > 0 ? (
            <>
              <strong className="font-medium text-fg">
                {formatPercent((targetAmount / annualGross - 1) * 100, numberFormat, 1)} raise
              </strong>{' '}
              - {fmtBase(Math.max(0, targetAmount - annualGross))} gap
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

function monthCellBg(done: boolean, missed: boolean, isFuture: boolean): string {
  if (done) return 'var(--secondary)';
  if (missed) return 'var(--warning)';
  if (isFuture) return 'var(--border-subtle)';
  return 'var(--border-default)';
}

function CalendarMonthGrid({
  monthKeys,
  completedKeys,
  missedMonths,
  onToggle,
}: Readonly<{
  monthKeys: string[];
  completedKeys: ReadonlySet<string>;
  missedMonths: readonly string[];
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
              aria-label={`${key}: ${monthCellTitle(done, missed, isFuture)}`}
              className={`aspect-square w-full rounded-sm transition-opacity duration-fast focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus-ring ${isFuture || done ? 'cursor-default' : 'cursor-pointer hover:opacity-70'}`}
              style={{ backgroundColor: monthCellBg(done, missed, isFuture) }}
            />
            <span className="text-[11px] leading-none text-fg-subtle">{label}</span>
          </div>
        );
      })}
    </div>
  );
}

function InvestHabitMonthGrid({
  totalMonths,
  monthsCompleted,
}: Readonly<{ totalMonths: number; monthsCompleted: number }>) {
  return (
    <div className="grid grid-cols-12 gap-px">
      {MONTH_ABBREVIATIONS.slice(0, Math.max(1, Math.min(totalMonths, 12))).map((month, index) => {
        const done = index < monthsCompleted;
        return (
          <div key={month} className="flex flex-col items-center gap-1">
            <div
              className={`aspect-square w-full rounded-sm ${done ? 'bg-secondary' : 'bg-surface-muted'}`}
            />
            <span className="text-[11px] leading-none text-fg-subtle">{month[0]}</span>
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
      <IconButton
        icon={Minus}
        label="Remove a completed month"
        title="Remove a completed month"
        variant="subtle"
        size="sm"
        className="border border-border-control disabled:opacity-40"
        onClick={() => onUpdateMonths(goalId, PREVIOUS_MONTH_DELTA)}
        disabled={monthsCompleted <= 0}
      />
      <span className="px-1 text-cell font-numeric text-fg">{monthsCompleted}</span>
      <IconButton
        icon={Check}
        label="Mark a month completed"
        title="Mark a month completed"
        variant="subtle"
        size="sm"
        className="border border-border-control disabled:opacity-40"
        onClick={() => onUpdateMonths(goalId, NEXT_MONTH_DELTA)}
        disabled={monthsCompleted >= totalMonths}
      />
    </div>
  );
}

type InvestHabitCardProps = {
  goal: Goal;
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
  monthlyTarget,
  monthsCompleted,
  totalMonths,
  fmtBase,
  completedMonthKeys,
  onToggleMissedMonth,
}: Readonly<
  Pick<
    InvestHabitCardProps,
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
      <div className="mb-2 flex justify-between">
        <span className={LABEL}>Monthly hits</span>
        <span className={FIGURE}>
          {monthsCompleted}/{totalMonths} months
        </span>
      </div>
      {monthKeys ? (
        <CalendarMonthGrid
          monthKeys={monthKeys}
          completedKeys={completedMonthKeys}
          missedMonths={goal.missedMonths ?? []}
          onToggle={(key) => onToggleMissedMonth(goal.id, key)}
        />
      ) : (
        <InvestHabitMonthGrid totalMonths={totalMonths} monthsCompleted={monthsCompleted} />
      )}
      <div className="mt-3">
        <p className="text-figure-md font-numeric text-fg">
          {fmtBase(monthlyTarget * monthsCompleted)}
        </p>
        <p className={CAPTION}>invested so far - {fmtBase(monthlyTarget)}/mo target</p>
      </div>
    </div>
  );
}

function GoalCardInvestHabit({
  goal,
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
        <p className="text-figure-md font-numeric text-fg">
          {currentAmount}
          {goal.unit && <span className="ml-1 text-caption text-fg-subtle">{goal.unit}</span>}
        </p>
        <p className={CAPTION}>
          target: {targetAmount}
          {goal.unit ? ` ${goal.unit}` : ''}
        </p>
      </div>
      {lowerIsBetter && clampedPct < 100 && (
        <div className="flex items-center gap-1.5 text-caption text-warning">
          <AlertCircle size={12} aria-hidden />
          <span>
            Reduce by {Math.max(0, currentAmount - targetAmount)}
            {goal.unit || ''}
          </span>
        </div>
      )}
      {status === 'complete' && <p className={DONE}>Done!</p>}
    </div>
  );
}

function GoalCardAnnual({
  goal,
  currentAmount,
  targetAmount,
  clampedPct,
  lowerIsBetter,
  status,
}: Readonly<{
  goal: Goal;
  currentAmount: number;
  targetAmount: number;
  clampedPct: number;
  lowerIsBetter: boolean;
  status: GoalStatus;
}>) {
  const { numberFormat } = useCurrency();
  // A lower-is-better goal that is still above its target shows its meter in the warning colour.
  const aboveTarget = lowerIsBetter && clampedPct < 100;
  const barWidth = getAnnualBarWidth(lowerIsBetter, clampedPct, currentAmount, targetAmount);
  return (
    <>
      <div>
        <div className="mb-1 flex justify-between">
          <span className={LABEL}>Progress {goal.unit ? `(${goal.unit})` : ''}</span>
          <span className={aboveTarget ? 'text-label font-numeric text-warning' : FIGURE}>
            {lowerIsBetter
              ? `${currentAmount} -> ${targetAmount}`
              : formatPercent(clampedPct, numberFormat, 0)}
          </span>
        </div>
        <ProgressMeter
          value={barWidth}
          label="Goal progress"
          indicatorClassName={aboveTarget ? 'bg-warning' : undefined}
        />
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
    <div className="flex min-w-0 items-start gap-2">
      <span className="mt-0.5 shrink-0 text-xl leading-none" aria-hidden>
        {goal.emoji}
      </span>
      <div className="min-w-0">
        <div className="flex items-start gap-1.5">
          <span
            className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
            style={{ backgroundColor: dataColorToken(goal.color || DATA_COLORS.primary) }}
            aria-hidden
          />
          <p className="text-title-section text-fg">{goal.name}</p>
          {status === 'complete' && (
            <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-success" aria-hidden />
          )}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <Badge size="sm" tone={statusMeta.tone}>
            {statusMeta.label}
          </Badge>
          <Badge size="sm" className={GOAL_CHIP_CLASS_NAME}>
            <Icon size={10} aria-hidden />
            {meta.label}
          </Badge>
          {sourceResolution.status !== 'manual' && (
            <Badge size="sm" tone={sourceResolution.status === 'linked' ? 'success' : 'warning'}>
              {sourceResolution.status === 'linked' ? sourceResolution.label : 'Source unavailable'}
            </Badge>
          )}
        </div>
      </div>
    </div>
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
    <div className="flex items-start justify-between gap-3 px-4 pt-4 pb-3">
      <GoalNameAndBadges
        goal={goal}
        status={status}
        meta={meta}
        sourceResolution={sourceResolution}
      />
      <div className="flex shrink-0 flex-col-reverse items-end gap-1 sm:flex-row sm:items-center">
        <span className="flex items-center gap-1 text-caption text-fg-subtle sm:mr-1">
          <CalendarDays size={12} className="text-fg-faint" aria-hidden />
          {goal.deadline}
        </span>
        <div className="flex items-center gap-1">
          <IconButton
            icon={Pencil}
            label="Edit goal"
            title="Edit goal"
            variant="subtle"
            size="sm"
            onClick={() => onEdit(goal.id)}
          />
          <IconButton
            icon={Trash2}
            label="Delete goal"
            title="Delete goal"
            variant="danger"
            size="sm"
            onClick={() => onDelete(goal.id)}
          />
        </div>
      </div>
    </div>
  );
}

type GoalBodyContentProps = {
  goal: Goal;
  type: GoalType;
  status: GoalStatus;
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
  const { goal, clampedPct, status, currentAmount, toBase } = props;
  const { targetAmount } = getGoalAmounts(goal, currentAmount, toBase);

  return (
    <GoalCardAnnual
      goal={goal}
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
    <div className="flex flex-1 flex-col gap-3 px-4 pb-4">
      {renderGoalTypeContent(props)}
      {props.goal.notes && (
        <p className="border-t border-border-subtle pt-3 text-caption text-fg-subtle">
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
  const clampedPct = Math.max(0, Math.min(pct, 100));

  return (
    <Card padding="none" className={cn('flex flex-col', status === 'complete' && 'border-success')}>
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
        clampedPct={clampedPct}
        currentAmount={sourceResolution.currentAmount}
        annualGross={goalProgressContext.annualGross}
        goalProgressContext={goalProgressContext}
        fmtBase={fmtBase}
        toBase={toBase}
        onUpdateMonths={onUpdateMonths}
        onToggleMissedMonth={onToggleMissedMonth}
      />
    </Card>
  );
}
