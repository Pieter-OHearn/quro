import { and, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { GOAL_SOURCE_TYPES, GOAL_TYPES, type GoalSourceType, type GoalType } from '@quro/shared';
import { HTTP_STATUS } from '../constants/http';
import { db } from '../db/client';
import { goals, savingsAccounts } from '../db/schema';
import { getAuthUser } from '../lib/authUser';
import {
  err,
  ok,
  parseCurrencyField,
  parseId,
  parseNumberField,
  parseOptionalIntegerField,
  parseOptionalNumberField,
  parseOptionalTextField,
  parsePatchFields,
  parseRequiredFields,
  parseTextField,
  readJsonBody,
  rejectUnknownFields,
  type FieldParsers,
  type ParseResult,
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
  currentAmount: (value) => parseNumberField(value, 'Current amount must be zero or greater', 0),
  targetAmount: (value) => parseNumberField(value, 'Target amount must be zero or greater', 0),
  deadline: (value) => parseTextField(value, 'Goal deadline is required'),
  year: (value) => parseOptionalIntegerField(value, 'Invalid year', MIN_GOAL_YEAR, MAX_GOAL_YEAR),
  category: (value) => parseTextField(value, 'Goal category is required'),
  monthlyContribution: (value) =>
    parseNumberField(value, 'Monthly contribution must be zero or greater', 0),
  monthlyTarget: (value) =>
    parseOptionalNumberField(value, 'Monthly target must be zero or greater', 0),
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

export function validateInvestHabitGoal(payload: GoalPayload): string | null {
  if (payload.type !== 'invest_habit') return null;
  if (payload.monthlyTarget == null || payload.monthlyTarget <= 0) {
    return 'Monthly target must be greater than zero';
  }
  if (payload.totalMonths == null || payload.totalMonths <= 0) {
    return 'Total months must be greater than zero';
  }
  return null;
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

function validateGoalPayload(payload: GoalPayload): string | null {
  if (exceedsGoalDuration(payload)) {
    return 'Months completed cannot exceed total months';
  }

  const investHabitError = validateInvestHabitGoal(payload);
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

export function parseGoalCreate(body: unknown): ParseResult<GoalPayload> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return err('Invalid goal payload');
  }
  const strictCheck = rejectUnknownFields(body as Record<string, unknown>, GOAL_FIELDS);
  if (!strictCheck.ok) return strictCheck;

  const parsed = parseRequiredFields(body as Record<string, unknown>, goalParsers);
  if (!parsed.ok) return parsed;

  const value = applyGoalSourceDefaults(parsed.value, body as Record<string, unknown>);
  const validationError = validateGoalPayload(value);
  return validationError ? err(validationError) : ok(value);
}

export function parseGoalPatch(body: unknown): ParseResult<Partial<GoalPayload>> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return err('Invalid goal payload');
  }
  const strictCheck = rejectUnknownFields(body as Record<string, unknown>, GOAL_FIELDS);
  if (!strictCheck.ok) return strictCheck;
  return parsePatchFields(body as Record<string, unknown>, goalParsers);
}

function pickPatchedValue<T>(value: T | undefined, fallback: T): T {
  return value === undefined ? fallback : value;
}

async function getOwnedGoal(goalId: number, userId: number) {
  const [goal] = await db
    .select()
    .from(goals)
    .where(and(eq(goals.id, goalId), eq(goals.userId, userId)));
  return goal ?? null;
}

export function mergeGoalPayload(
  patch: Partial<GoalPayload>,
  existing: typeof goals.$inferSelect,
): ParseResult<GoalPayload> {
  const sourceId =
    patch.sourceId !== undefined
      ? patch.sourceId
      : patch.sourceType === undefined
        ? existing.sourceId
        : null;

  return parseGoalCreate({
    type: pickPatchedValue(patch.type, existing.type),
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
    monthlyTarget: patch.monthlyTarget === undefined ? existing.monthlyTarget : patch.monthlyTarget,
    monthsCompleted: pickPatchedValue(patch.monthsCompleted, existing.monthsCompleted),
    totalMonths: pickPatchedValue(patch.totalMonths, existing.totalMonths),
    unit: pickPatchedValue(patch.unit, existing.unit),
    color: pickPatchedValue(patch.color, existing.color),
    notes: pickPatchedValue(patch.notes, existing.notes),
    currency: pickPatchedValue(patch.currency, existing.currency),
    startMonth: pickPatchedValue(patch.startMonth, existing.startMonth),
    missedMonths:
      patch.missedMonths === undefined
        ? (existing.missedMonths as string[] | null)
        : patch.missedMonths,
  });
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
  const data = await db.select().from(goals).where(eq(goals.userId, user.id));
  return c.json({ data });
});

app.get('/:id', async (c) => {
  const user = getAuthUser(c);
  const id = parseId(c.req.param('id'));
  if (id === null) return c.json({ error: 'Invalid goal id' }, HTTP_STATUS.BAD_REQUEST);

  const data = await getOwnedGoal(id, user.id);
  if (!data) return c.json({ error: 'Goal not found' }, HTTP_STATUS.NOT_FOUND);
  return c.json({ data });
});

app.post('/', async (c) => {
  const user = getAuthUser(c);
  const rawBody = await readJsonBody(c.req, 'Invalid goal payload');
  if (!rawBody.ok) return c.json({ error: rawBody.error }, HTTP_STATUS.BAD_REQUEST);

  const body = parseGoalCreate(rawBody.value);
  if (!body.ok) return c.json({ error: body.error }, HTTP_STATUS.BAD_REQUEST);

  const sourceError = await validateGoalSourceOwnership(body.value, user.id);
  if (sourceError) return c.json({ error: sourceError }, HTTP_STATUS.BAD_REQUEST);

  const [data] = await db.insert(goals).values(toGoalInsertValues(body.value, user.id)).returning();
  return c.json({ data }, HTTP_STATUS.CREATED);
});

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

  const existing = await getOwnedGoal(id, user.id);
  if (!existing) return c.json({ error: 'Goal not found' }, HTTP_STATUS.NOT_FOUND);

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
  return c.json({ data });
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
  return c.json({ data });
});

export default app;
