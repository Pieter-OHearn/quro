import { and, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { HTTP_STATUS } from '../constants/http';
import { db } from '../db/client';
import { goals } from '../db/schema';
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
] as const;
const GOAL_TYPES = [
  'savings',
  'salary',
  'invest_habit',
  'portfolio',
  'net_worth',
  'annual',
] as const;

type GoalType = (typeof GOAL_TYPES)[number];

type GoalPayload = {
  type: GoalType;
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
};

type GoalInsert = typeof goals.$inferInsert;

function parseGoalTypeField(value: unknown): ParseResult<GoalType> {
  return typeof value === 'string' && GOAL_TYPES.includes(value as GoalType)
    ? ok(value as GoalType)
    : err('Invalid goal type');
}

const goalParsers: FieldParsers<GoalPayload> = {
  type: parseGoalTypeField,
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
};

function toGoalInsertValues(payload: GoalPayload, userId: number): GoalInsert {
  return {
    userId,
    type: payload.type,
    name: payload.name,
    emoji: payload.emoji,
    currentAmount: payload.currentAmount.toString(),
    targetAmount: payload.targetAmount.toString(),
    deadline: payload.deadline,
    year: payload.year,
    category: payload.category,
    monthlyContribution: payload.monthlyContribution.toString(),
    monthlyTarget: payload.monthlyTarget?.toString() ?? null,
    monthsCompleted: payload.monthsCompleted,
    totalMonths: payload.totalMonths,
    unit: payload.unit,
    color: payload.color,
    notes: payload.notes,
    currency: payload.currency,
  };
}

function exceedsGoalDuration(payload: GoalPayload): boolean {
  return (
    payload.monthsCompleted != null &&
    payload.totalMonths != null &&
    payload.monthsCompleted > payload.totalMonths
  );
}

function validateInvestHabitGoal(payload: GoalPayload): string | null {
  if (payload.type !== 'invest_habit') return null;
  if (payload.monthlyTarget == null || payload.monthlyTarget <= 0) {
    return 'Monthly target must be greater than zero';
  }
  if (payload.totalMonths == null || payload.totalMonths <= 0) {
    return 'Total months must be greater than zero';
  }
  return null;
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

  return null;
}

function parseGoalCreate(body: unknown): ParseResult<GoalPayload> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return err('Invalid goal payload');
  }
  const strictCheck = rejectUnknownFields(body as Record<string, unknown>, GOAL_FIELDS);
  if (!strictCheck.ok) return strictCheck;

  const parsed = parseRequiredFields(body as Record<string, unknown>, goalParsers);
  if (!parsed.ok) return parsed;

  const validationError = validateGoalPayload(parsed.value);
  return validationError ? err(validationError) : parsed;
}

function parseGoalPatch(body: unknown): ParseResult<Partial<GoalPayload>> {
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

function mergeGoalPayload(
  patch: Partial<GoalPayload>,
  existing: typeof goals.$inferSelect,
): ParseResult<GoalPayload> {
  return parseGoalCreate({
    type: pickPatchedValue(patch.type, existing.type),
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
  });
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
