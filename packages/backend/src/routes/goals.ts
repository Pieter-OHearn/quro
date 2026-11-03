import { findOwnedRow } from '../lib/access';
import { and, asc, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import {
  countGoalMonths,
  formatGoalMonth,
  GOAL_SOURCE_TYPES,
  GOAL_TYPES,
  type GoalSourceType,
  type GoalType,
  parseGoalMonth,
  TEXT_FIELD_LIMITS,
} from '@quro/shared';
import { HTTP_STATUS } from '../constants/http';
import { db } from '../db/client';
import { goals, savingsAccounts } from '../db/schema';
import { getAuthUser } from '../lib/authUser';
import {
  err,
  type FieldParsers,
  ok,
  parseCurrencyField,
  parseId,
  parseMoneyField,
  parseOptionalIntegerField,
  parseOptionalMoneyField,
  parseOptionalTextField,
  parsePatchFields,
  parseRequiredFields,
  type ParseResult,
  parseTextField,
  checkTextLimits,
  pickPatchedValue,
  readJsonBody,
  rejectUnknownFields,
} from '../lib/requestValidation';

const app = new Hono();
const MIN_GOAL_YEAR = 2000;
const MAX_GOAL_YEAR = 9999;

const GOAL_FIELDS = [
  'type',
  'sourceType',
  'sourceId',
  'name',
  'emoji',
  'currentAmount',
  'targetAmount',
  'deadline',
  'year',
  'category',
  'monthlyContribution',
  'monthlyTarget',
  'monthsCompleted',
  'totalMonths',
  'unit',
  'color',
  'notes',
  'currency',
  'startMonth',
  'missedMonths',
] as const;

export type GoalPayload = {
  type: GoalType;
  sourceType: GoalSourceType;
  sourceId: number | null;
  name: string;
  emoji: string | null;
  currentAmount: number;
  targetAmount: number;
  deadline: string;
  year: number | null;
  category: string;
  monthlyContribution: number;
  monthlyTarget: number | null;
  monthsCompleted: number | null;
  totalMonths: number | null;
  unit: string | null;
  color: string | null;
  notes: string | null;
  currency: 'EUR' | 'GBP' | 'USD' | 'AUD' | 'NZD' | 'CAD' | 'CHF' | 'SGD';
  startMonth: string | null;
  missedMonths: string[] | null;
};

type GoalInsert = typeof goals.$inferInsert;
type GoalRow = typeof goals.$inferSelect;

function parseGoalTypeField(value: unknown): ParseResult<GoalType> {
  return typeof value === 'string' && GOAL_TYPES.includes(value as GoalType)
    ? ok(value as GoalType)
    : err('Invalid goal type');
}

function parseGoalSourceTypeField(value: unknown): ParseResult<GoalSourceType> {
  if (value == null || value === '') return ok('manual');
  return typeof value === 'string' && GOAL_SOURCE_TYPES.includes(value as GoalSourceType)
    ? ok(value as GoalSourceType)
    : err('Invalid goal source type');
}

const goalParsers: FieldParsers<GoalPayload> = {
  type: parseGoalTypeField,
  sourceType: parseGoalSourceTypeField,
  sourceId: (value) => parseOptionalIntegerField(value, 'Invalid goal source id', 1),
  name: (value) => parseTextField(value, 'Goal name is required'),
  emoji: (value) => parseOptionalTextField(value, 'Goal emoji must be a string'),
  currentAmount: (value) =>
    parseMoneyField(value, {
      field: 'currentAmount',
      error: 'Current amount must be zero or greater',
      min: 0,
    }),
  targetAmount: (value) =>
    parseMoneyField(value, {
      field: 'targetAmount',
      error: 'Target amount must be zero or greater',
      min: 0,
    }),
  deadline: (value) => parseTextField(value, 'Goal deadline is required'),
  year: (value) => parseOptionalIntegerField(value, 'Invalid year', MIN_GOAL_YEAR, MAX_GOAL_YEAR),
  category: (value) => parseTextField(value, 'Goal category is required'),
  monthlyContribution: (value) =>
    parseMoneyField(value, {
      field: 'monthlyContribution',
      error: 'Monthly contribution must be zero or greater',
      min: 0,
    }),
  monthlyTarget: (value) =>
    parseOptionalMoneyField(value, {
      field: 'monthlyTarget',
      error: 'Monthly target must be zero or greater',
      min: 0,
    }),
  monthsCompleted: (value) =>
    parseOptionalIntegerField(value, 'Months completed must be zero or greater', 0),
  totalMonths: (value) =>
    parseOptionalIntegerField(value, 'Total months must be greater than zero', 1),
  unit: (value) => parseOptionalTextField(value, 'Goal unit must be a string'),
  color: (value) => parseOptionalTextField(value, 'Goal color must be a string'),
  notes: (value) => parseOptionalTextField(value, 'Goal notes must be a string'),
  currency: parseCurrencyField,
  startMonth: (value) => parseOptionalTextField(value, 'Start month must be a string'),
  missedMonths: (value) => {
    if (value == null) return ok(null);
    if (Array.isArray(value) && value.every((item) => typeof item === 'string'))
      return ok(value as string[]);
    return err('Missed months must be an array of strings');
  },
};

function toGoalInsertValues(payload: GoalPayload, userId: number): GoalInsert {
  return {
    userId,
    type: payload.type,
    sourceType: payload.sourceType,
    sourceId: payload.sourceId,
    name: payload.name,
    emoji: payload.emoji,
    currentAmount: payload.currentAmount,
    targetAmount: payload.targetAmount,
    deadline: payload.deadline,
    year: payload.year,
    category: payload.category,
    monthlyContribution: payload.monthlyContribution,
    monthlyTarget: payload.monthlyTarget ?? null,
    monthsCompleted: payload.monthsCompleted,
    totalMonths: payload.totalMonths,
    unit: payload.unit,
    color: payload.color,
    notes: payload.notes,
    currency: payload.currency,
    startMonth: payload.startMonth,
    missedMonths: payload.missedMonths,
  };
}

export function exceedsGoalDuration(payload: GoalPayload): boolean {
  return (
    payload.monthsCompleted != null &&
    payload.totalMonths != null &&
    payload.monthsCompleted > payload.totalMonths
  );
}

type GoalParseOptions = {
  /** A new invest habit needs its start month; one saved before start months existed may lack it. */
  requireStartMonth: boolean;
};

const CREATE_OPTIONS: GoalParseOptions = { requireStartMonth: true };

function validateInvestHabitRange(payload: GoalPayload, options: GoalParseOptions): string | null {
  if (payload.startMonth == null) {
    return options.requireStartMonth ? 'Start month is required for an invest habit' : null;
  }
  const start = parseGoalMonth(payload.startMonth);
  if (!start) return 'Start month must be a month such as "Oct 2026"';
  const end = parseGoalMonth(payload.deadline);
  if (!end) return 'End month must be a month such as "Jun 2027"';
  return countGoalMonths(start, end) > 0 ? null : 'Start month cannot be after the end month';
}

function hasManualMonths(payload: GoalPayload): boolean {
  return payload.monthsCompleted != null || payload.missedMonths != null;
}

export function validateInvestHabitGoal(
  payload: GoalPayload,
  options: GoalParseOptions = CREATE_OPTIONS,
): string | null {
  if (payload.type !== 'invest_habit') return null;
  if (hasManualMonths(payload)) {
    return 'Invest habit months come from investment buys and cannot be set';
  }
  if (payload.monthlyTarget == null || payload.monthlyTarget <= 0) {
    return 'Monthly target must be greater than zero';
  }
  const rangeError = validateInvestHabitRange(payload, options);
  if (rangeError) return rangeError;
  if (payload.startMonth == null && (payload.totalMonths == null || payload.totalMonths <= 0)) {
    return 'Total months must be greater than zero';
  }
  return null;
}

/** An invest habit's months run from its start month to its end month; store them as such. */
function normalizeInvestHabitRange(payload: GoalPayload): GoalPayload {
  if (payload.type !== 'invest_habit' || payload.startMonth == null) return payload;
  const start = parseGoalMonth(payload.startMonth);
  const end = parseGoalMonth(payload.deadline);
  if (!start || !end) return payload;
  return {
    ...payload,
    startMonth: formatGoalMonth(start),
    deadline: formatGoalMonth(end),
    totalMonths: countGoalMonths(start, end),
  };
}

/** Invest habits count their months from investment buys; stored manual months are ignored. */
export function serializeGoal(row: GoalRow): GoalRow {
  if (row.type !== 'invest_habit') return row;
  return { ...row, monthsCompleted: null, missedMonths: null };
}

function validateManualGoalSource(payload: GoalPayload): string | null {
  return payload.sourceId === null ? null : 'Manual goals cannot include a source id';
}

function validateLatestSalaryGoalSource(payload: GoalPayload): string | null {
  if (payload.type !== 'salary') {
    return 'Latest salary can only be linked to salary goals';
  }
  return payload.sourceId === null ? null : 'Latest salary goals cannot include a source id';
}

function validateSavingsAccountGoalSource(payload: GoalPayload): string | null {
  if (payload.type !== 'savings') {
    return 'Savings accounts can only be linked to savings goals';
  }
  return payload.sourceId === null ? 'Savings account source id is required' : null;
}

function validatePortfolioTotalGoalSource(payload: GoalPayload): string | null {
  if (payload.type !== 'portfolio') {
    return 'Portfolio total can only be linked to portfolio goals';
  }
  return payload.sourceId === null ? null : 'Portfolio total goals cannot include a source id';
}

function validateNetWorthTotalGoalSource(payload: GoalPayload): string | null {
  if (payload.type !== 'net_worth') {
    return 'Net worth total can only be linked to net worth goals';
  }
  return payload.sourceId === null ? null : 'Net worth total goals cannot include a source id';
}

function validateInvestHabitBuysGoalSource(payload: GoalPayload): string | null {
  if (payload.type !== 'invest_habit') {
    return 'Invest habit buys can only be linked to invest habit goals';
  }
  return payload.sourceId === null ? null : 'Invest habit buys goals cannot include a source id';
}

const GOAL_SOURCE_VALIDATORS: Record<GoalSourceType, (payload: GoalPayload) => string | null> = {
  manual: validateManualGoalSource,
  salary_latest_gross: validateLatestSalaryGoalSource,
  savings_account: validateSavingsAccountGoalSource,
  portfolio_total: validatePortfolioTotalGoalSource,
  net_worth_total: validateNetWorthTotalGoalSource,
  invest_habit_buys: validateInvestHabitBuysGoalSource,
};

export function validateGoalSource(payload: GoalPayload): string | null {
  if (payload.type === 'salary' && payload.sourceType !== 'salary_latest_gross') {
    return 'Salary goals must use the latest salary source';
  }
  if (payload.type === 'portfolio' && payload.sourceType !== 'portfolio_total') {
    return 'Portfolio goals must use the portfolio total source';
  }
  if (payload.type === 'net_worth' && payload.sourceType !== 'net_worth_total') {
    return 'Net worth goals must use the net worth total source';
  }
  if (payload.type === 'invest_habit' && payload.sourceType !== 'invest_habit_buys') {
    return 'Invest habit goals must use the invest habit buys source';
  }

  return GOAL_SOURCE_VALIDATORS[payload.sourceType](payload);
}

function requiresTargetAmount(type: GoalType): boolean {
  return type !== 'invest_habit';
}

function validateGoalPayload(payload: GoalPayload, options: GoalParseOptions): string | null {
  if (exceedsGoalDuration(payload)) {
    return 'Months completed cannot exceed total months';
  }

  const investHabitError = validateInvestHabitGoal(payload, options);
  if (investHabitError) return investHabitError;

  if (requiresTargetAmount(payload.type) && payload.targetAmount <= 0) {
    return 'Target amount must be greater than zero';
  }

  return validateGoalSource(payload);
}

export function applyGoalSourceDefaults(
  payload: GoalPayload,
  body: Record<string, unknown>,
): GoalPayload {
  if ('sourceType' in body) return payload;
  if (payload.type === 'salary') {
    return { ...payload, sourceType: 'salary_latest_gross', sourceId: null };
  }
  if (payload.type === 'portfolio') {
    return { ...payload, sourceType: 'portfolio_total', sourceId: null };
  }
  if (payload.type === 'net_worth') {
    return { ...payload, sourceType: 'net_worth_total', sourceId: null };
  }
  if (payload.type === 'invest_habit') {
    return { ...payload, sourceType: 'invest_habit_buys', sourceId: null };
  }
  return payload;
}

export function parseGoalCreate(
  body: unknown,
  options: GoalParseOptions = CREATE_OPTIONS,
): ParseResult<GoalPayload> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return err('Invalid goal payload');
  }
  const strictCheck = rejectUnknownFields(body as Record<string, unknown>, GOAL_FIELDS);
  if (!strictCheck.ok) return strictCheck;

  const parsed = parseRequiredFields(body as Record<string, unknown>, goalParsers);
  if (!parsed.ok) return parsed;

  const value = applyGoalSourceDefaults(parsed.value, body as Record<string, unknown>);
  const validationError = validateGoalPayload(value, options);
  return validationError ? err(validationError) : ok(normalizeInvestHabitRange(value));
}

function parseGoalPatch(body: unknown): ParseResult<Partial<GoalPayload>> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return err('Invalid goal payload');
  }
  const strictCheck = rejectUnknownFields(body as Record<string, unknown>, GOAL_FIELDS);
  if (!strictCheck.ok) return strictCheck;
  return parsePatchFields(body as Record<string, unknown>, goalParsers);
}

export function mergeGoalPayload(
  patch: Partial<GoalPayload>,
  existing: GoalRow,
): ParseResult<GoalPayload> {
  const sourceId =
    patch.sourceId !== undefined
      ? patch.sourceId
      : patch.sourceType === undefined
        ? existing.sourceId
        : null;
  const type = pickPatchedValue(patch.type, existing.type);
  // An invest habit's stored manual months are ignored, so a write clears them.
  const kept =
    type === 'invest_habit' ? { ...existing, monthsCompleted: null, missedMonths: null } : existing;
  // A habit saved before start months existed keeps working until its start month is set.
  const options = {
    requireStartMonth: existing.type !== 'invest_habit' || existing.startMonth != null,
  };

  return parseGoalCreate(
    {
      type,
      sourceType: pickPatchedValue(patch.sourceType, existing.sourceType),
      sourceId,
      name: pickPatchedValue(patch.name, existing.name),
      emoji: pickPatchedValue(patch.emoji, existing.emoji),
      currentAmount: patch.currentAmount ?? existing.currentAmount,
      targetAmount: patch.targetAmount ?? existing.targetAmount,
      deadline: pickPatchedValue(patch.deadline, existing.deadline),
      year: pickPatchedValue(patch.year, existing.year),
      category: pickPatchedValue(patch.category, existing.category),
      monthlyContribution: patch.monthlyContribution ?? existing.monthlyContribution,
      monthlyTarget:
        patch.monthlyTarget === undefined ? existing.monthlyTarget : patch.monthlyTarget,
      monthsCompleted: pickPatchedValue(patch.monthsCompleted, kept.monthsCompleted),
      totalMonths: pickPatchedValue(patch.totalMonths, existing.totalMonths),
      unit: pickPatchedValue(patch.unit, existing.unit),
      color: pickPatchedValue(patch.color, existing.color),
      notes: pickPatchedValue(patch.notes, existing.notes),
      currency: pickPatchedValue(patch.currency, existing.currency),
      startMonth: pickPatchedValue(patch.startMonth, existing.startMonth),
      missedMonths:
        patch.missedMonths === undefined
          ? (kept.missedMonths as string[] | null)
          : patch.missedMonths,
    },
    options,
  );
}

async function validateGoalSourceOwnership(
  payload: GoalPayload,
  userId: number,
): Promise<string | null> {
  if (payload.sourceType !== 'savings_account') return null;
  if (payload.sourceId === null) return 'Savings account source id is required';

  const [account] = await db
    .select({ id: savingsAccounts.id })
    .from(savingsAccounts)
    .where(and(eq(savingsAccounts.id, payload.sourceId), eq(savingsAccounts.userId, userId)));
  return account ? null : 'Savings account source not found';
}

function didPatchGoalSource(patch: Partial<GoalPayload>): boolean {
  return patch.sourceType !== undefined || patch.sourceId !== undefined;
}

app.get('/', async (c) => {
  const user = getAuthUser(c);
  const data = await db
    .select()
    .from(goals)
    .where(eq(goals.userId, user.id))
    .orderBy(asc(goals.id));
  return c.json({ data: data.map(serializeGoal) });
});

app.get('/:id', async (c) => {
  const user = getAuthUser(c);
  const id = parseId(c.req.param('id'));
  if (id === null) return c.json({ error: 'Invalid goal id' }, HTTP_STATUS.BAD_REQUEST);

  const data = await findOwnedRow(goals, id, user.id);
  if (!data) return c.json({ error: 'Goal not found' }, HTTP_STATUS.NOT_FOUND);
  return c.json({ data: serializeGoal(data) });
});

app.post('/', async (c) => {
  const user = getAuthUser(c);
  const rawBody = await readJsonBody(c.req, 'Invalid goal payload');
  if (!rawBody.ok) return c.json({ error: rawBody.error }, HTTP_STATUS.BAD_REQUEST);

  const body = parseGoalCreate(rawBody.value);
  if (!body.ok) return c.json({ error: body.error }, HTTP_STATUS.BAD_REQUEST);
  const lengths = await checkTextLimits(body.value, TEXT_FIELD_LIMITS.goal);
  if (!lengths.ok) return c.json({ error: lengths.error }, HTTP_STATUS.BAD_REQUEST);

  const sourceError = await validateGoalSourceOwnership(body.value, user.id);
  if (sourceError) return c.json({ error: sourceError }, HTTP_STATUS.BAD_REQUEST);

  const [data] = await db.insert(goals).values(toGoalInsertValues(body.value, user.id)).returning();
  return c.json({ data: serializeGoal(data!) }, HTTP_STATUS.CREATED);
});

// eslint-disable-next-line complexity
app.patch('/:id', async (c) => {
  const user = getAuthUser(c);
  const id = parseId(c.req.param('id'));
  if (id === null) return c.json({ error: 'Invalid goal id' }, HTTP_STATUS.BAD_REQUEST);

  const rawBody = await readJsonBody(c.req, 'Invalid goal payload');
  if (!rawBody.ok) return c.json({ error: rawBody.error }, HTTP_STATUS.BAD_REQUEST);

  const body = parseGoalPatch(rawBody.value);
  if (!body.ok) return c.json({ error: body.error }, HTTP_STATUS.BAD_REQUEST);
  if (Object.keys(body.value).length === 0) {
    return c.json({ error: 'No goal fields provided' }, HTTP_STATUS.BAD_REQUEST);
  }

  const existing = await findOwnedRow(goals, id, user.id);
  if (!existing) return c.json({ error: 'Goal not found' }, HTTP_STATUS.NOT_FOUND);
  const lengths = await checkTextLimits(body.value, TEXT_FIELD_LIMITS.goal, existing);
  if (!lengths.ok) return c.json({ error: lengths.error }, HTTP_STATUS.BAD_REQUEST);

  const merged = mergeGoalPayload(body.value, existing);
  if (!merged.ok) return c.json({ error: merged.error }, HTTP_STATUS.BAD_REQUEST);

  if (didPatchGoalSource(body.value)) {
    const sourceError = await validateGoalSourceOwnership(merged.value, user.id);
    if (sourceError) return c.json({ error: sourceError }, HTTP_STATUS.BAD_REQUEST);
  }

  const [data] = await db
    .update(goals)
    .set(toGoalInsertValues(merged.value, user.id))
    .where(and(eq(goals.id, id), eq(goals.userId, user.id)))
    .returning();
  if (!data) return c.json({ error: 'Goal not found' }, HTTP_STATUS.NOT_FOUND);
  return c.json({ data: serializeGoal(data) });
});

app.delete('/:id', async (c) => {
  const user = getAuthUser(c);
  const id = parseId(c.req.param('id'));
  if (id === null) return c.json({ error: 'Invalid goal id' }, HTTP_STATUS.BAD_REQUEST);

  const [data] = await db
    .delete(goals)
    .where(and(eq(goals.id, id), eq(goals.userId, user.id)))
    .returning();
  if (!data) return c.json({ error: 'Goal not found' }, HTTP_STATUS.NOT_FOUND);
  return c.json({ data: serializeGoal(data) });
});

export default app;
