import { and, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { HTTP_STATUS } from '../constants/http';
import { db } from '../db/client';
import { budgetCategories, budgetTransactions } from '../db/schema';
import { getAuthUser } from '../lib/authUser';
import {
  err,
  ok,
  parseDateField,
  parseId,
  parseIntegerField,
  parseNumber,
  parseNumberField,
  parsePatchFields,
  parseRequiredFields,
  parseTextField,
  readJsonBody,
  rejectUnknownFields,
  type FieldParsers,
  type ParseResult,
} from '../lib/requestValidation';

const app = new Hono();
const MIN_BUDGET_YEAR = 2000;
const MAX_BUDGET_YEAR = 9999;

const BUDGET_CATEGORY_FIELDS = [
  'name',
  'emoji',
  'budgeted',
  'spent',
  'color',
  'month',
  'year',
] as const;
const BUDGET_TRANSACTION_FIELDS = [
  'categoryId',
  'description',
  'amount',
  'date',
  'merchant',
] as const;
const BUDGET_MONTHS = [
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
] as const;

type BudgetMonth = (typeof BUDGET_MONTHS)[number];

type BudgetCategoryPayload = {
  name: string;
  emoji: string;
  budgeted: number;
  spent: number;
  color: string;
  month: BudgetMonth;
  year: number;
};

type BudgetTransactionPayload = {
  categoryId: number;
  description: string;
  amount: number;
  date: string;
  merchant: string;
};

type BudgetCategoryInsert = typeof budgetCategories.$inferInsert;
type BudgetTransactionInsert = typeof budgetTransactions.$inferInsert;

function parseBudgetMonthField(value: unknown): ParseResult<BudgetMonth> {
  return typeof value === 'string' && BUDGET_MONTHS.includes(value as BudgetMonth)
    ? ok(value as BudgetMonth)
    : err('Invalid month');
}

function parsePositiveNumberField(value: unknown, error: string): ParseResult<number> {
  const parsed = parseNumber(value);
  return parsed === null || parsed <= 0 ? err(error) : ok(parsed);
}

const budgetCategoryParsers: FieldParsers<BudgetCategoryPayload> = {
  name: (value) => parseTextField(value, 'Category name is required'),
  emoji: (value) => parseTextField(value, 'Emoji is required'),
  budgeted: (value) => parseNumberField(value, 'Budgeted amount must be zero or greater', 0),
  spent: (value) => parseNumberField(value, 'Spent amount must be zero or greater', 0),
  color: (value) => parseTextField(value, 'Color is required'),
  month: parseBudgetMonthField,
  year: (value) => parseIntegerField(value, 'Invalid year', MIN_BUDGET_YEAR, MAX_BUDGET_YEAR),
};

const budgetTransactionParsers: FieldParsers<BudgetTransactionPayload> = {
  categoryId: (value) => parseIntegerField(value, 'Invalid category id', 1),
  description: (value) => parseTextField(value, 'Description is required'),
  amount: (value) =>
    parsePositiveNumberField(value, 'Transaction amount must be greater than zero'),
  date: (value) => parseDateField(value, 'Transaction date must be a valid ISO date'),
  merchant: (value) => parseTextField(value, 'Merchant is required'),
};

function parseBudgetCategoryCreate(body: unknown): ParseResult<BudgetCategoryPayload> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return err('Invalid budget category payload');
  }
  const strictCheck = rejectUnknownFields(body as Record<string, unknown>, BUDGET_CATEGORY_FIELDS);
  if (!strictCheck.ok) return strictCheck;
  return parseRequiredFields(body as Record<string, unknown>, budgetCategoryParsers);
}

function parseBudgetCategoryPatch(body: unknown): ParseResult<Partial<BudgetCategoryPayload>> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return err('Invalid budget category payload');
  }
  const strictCheck = rejectUnknownFields(body as Record<string, unknown>, BUDGET_CATEGORY_FIELDS);
  if (!strictCheck.ok) return strictCheck;
  return parsePatchFields(body as Record<string, unknown>, budgetCategoryParsers);
}

function parseBudgetTransactionCreate(body: unknown): ParseResult<BudgetTransactionPayload> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return err('Invalid budget transaction payload');
  }
  const strictCheck = rejectUnknownFields(
    body as Record<string, unknown>,
    BUDGET_TRANSACTION_FIELDS,
  );
  if (!strictCheck.ok) return strictCheck;
  return parseRequiredFields(body as Record<string, unknown>, budgetTransactionParsers);
}

function parseBudgetTransactionPatch(
  body: unknown,
): ParseResult<Partial<BudgetTransactionPayload>> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return err('Invalid budget transaction payload');
  }
  const strictCheck = rejectUnknownFields(
    body as Record<string, unknown>,
    BUDGET_TRANSACTION_FIELDS,
  );
  if (!strictCheck.ok) return strictCheck;
  return parsePatchFields(body as Record<string, unknown>, budgetTransactionParsers);
}

async function getOwnedBudgetCategory(categoryId: number, userId: number) {
  const [category] = await db
    .select()
    .from(budgetCategories)
    .where(and(eq(budgetCategories.id, categoryId), eq(budgetCategories.userId, userId)));
  return category ?? null;
}

async function getOwnedBudgetTransaction(transactionId: number, userId: number) {
  const [transaction] = await db
    .select()
    .from(budgetTransactions)
    .where(and(eq(budgetTransactions.id, transactionId), eq(budgetTransactions.userId, userId)));
  return transaction ?? null;
}

function toBudgetCategoryInsertValues(
  payload: BudgetCategoryPayload,
  userId: number,
): BudgetCategoryInsert {
  return {
    userId,
    name: payload.name,
    emoji: payload.emoji,
    budgeted: payload.budgeted.toString(),
    spent: payload.spent.toString(),
    color: payload.color,
    month: payload.month,
    year: payload.year,
  };
}

function toBudgetCategoryUpdateValues(
  payload: Partial<BudgetCategoryPayload>,
): Partial<BudgetCategoryInsert> {
  return {
    name: payload.name,
    emoji: payload.emoji,
    budgeted: payload.budgeted?.toString(),
    spent: payload.spent?.toString(),
    color: payload.color,
    month: payload.month,
    year: payload.year,
  };
}

function toBudgetTransactionInsertValues(
  payload: BudgetTransactionPayload,
  userId: number,
): BudgetTransactionInsert {
  return {
    userId,
    categoryId: payload.categoryId,
    description: payload.description,
    amount: payload.amount.toString(),
    date: payload.date,
    merchant: payload.merchant,
  };
}

function toBudgetTransactionUpdateValues(
  payload: Partial<BudgetTransactionPayload>,
): Partial<BudgetTransactionInsert> {
  return {
    categoryId: payload.categoryId,
    description: payload.description,
    amount: payload.amount?.toString(),
    date: payload.date,
    merchant: payload.merchant,
  };
}

// ── Categories ───────────────────────────────────────────────────────────────

app.get('/categories', async (c) => {
  const user = getAuthUser(c);
  const data = await db.select().from(budgetCategories).where(eq(budgetCategories.userId, user.id));
  return c.json({ data });
});

app.get('/categories/:id', async (c) => {
  const user = getAuthUser(c);
  const id = parseId(c.req.param('id'));
  if (id === null) return c.json({ error: 'Invalid category id' }, HTTP_STATUS.BAD_REQUEST);

  const data = await getOwnedBudgetCategory(id, user.id);
  if (!data) return c.json({ error: 'Category not found' }, HTTP_STATUS.NOT_FOUND);
  return c.json({ data });
});

app.post('/categories', async (c) => {
  const user = getAuthUser(c);
  const rawBody = await readJsonBody(c.req, 'Invalid budget category payload');
  if (!rawBody.ok) return c.json({ error: rawBody.error }, HTTP_STATUS.BAD_REQUEST);

  const body = parseBudgetCategoryCreate(rawBody.value);
  if (!body.ok) return c.json({ error: body.error }, HTTP_STATUS.BAD_REQUEST);

  const [data] = await db
    .insert(budgetCategories)
    .values(toBudgetCategoryInsertValues(body.value, user.id))
    .returning();
  return c.json({ data }, HTTP_STATUS.CREATED);
});

app.patch('/categories/:id', async (c) => {
  const user = getAuthUser(c);
  const id = parseId(c.req.param('id'));
  if (id === null) return c.json({ error: 'Invalid category id' }, HTTP_STATUS.BAD_REQUEST);

  const rawBody = await readJsonBody(c.req, 'Invalid budget category payload');
  if (!rawBody.ok) return c.json({ error: rawBody.error }, HTTP_STATUS.BAD_REQUEST);

  const body = parseBudgetCategoryPatch(rawBody.value);
  if (!body.ok) return c.json({ error: body.error }, HTTP_STATUS.BAD_REQUEST);
  if (Object.keys(body.value).length === 0) {
    return c.json({ error: 'No budget category fields provided' }, HTTP_STATUS.BAD_REQUEST);
  }

  const [data] = await db
    .update(budgetCategories)
    .set(toBudgetCategoryUpdateValues(body.value))
    .where(and(eq(budgetCategories.id, id), eq(budgetCategories.userId, user.id)))
    .returning();
  if (!data) return c.json({ error: 'Category not found' }, HTTP_STATUS.NOT_FOUND);
  return c.json({ data });
});

app.delete('/categories/:id', async (c) => {
  const user = getAuthUser(c);
  const id = parseId(c.req.param('id'));
  if (id === null) return c.json({ error: 'Invalid category id' }, HTTP_STATUS.BAD_REQUEST);

  const [data] = await db
    .delete(budgetCategories)
    .where(and(eq(budgetCategories.id, id), eq(budgetCategories.userId, user.id)))
    .returning();
  if (!data) return c.json({ error: 'Category not found' }, HTTP_STATUS.NOT_FOUND);
  return c.json({ data });
});

// ── Transactions ─────────────────────────────────────────────────────────────

app.get('/transactions', async (c) => {
  const user = getAuthUser(c);
  const categoryId = c.req.query('categoryId');
  if (categoryId) {
    const parsedCategoryId = parseId(categoryId);
    if (parsedCategoryId === null) {
      return c.json({ error: 'Invalid category id' }, HTTP_STATUS.BAD_REQUEST);
    }
    const data = await db
      .select()
      .from(budgetTransactions)
      .where(
        and(
          eq(budgetTransactions.categoryId, parsedCategoryId),
          eq(budgetTransactions.userId, user.id),
        ),
      );
    return c.json({ data });
  }

  const data = await db
    .select()
    .from(budgetTransactions)
    .where(eq(budgetTransactions.userId, user.id));
  return c.json({ data });
});

app.get('/transactions/:id', async (c) => {
  const user = getAuthUser(c);
  const id = parseId(c.req.param('id'));
  if (id === null) return c.json({ error: 'Invalid transaction id' }, HTTP_STATUS.BAD_REQUEST);

  const data = await getOwnedBudgetTransaction(id, user.id);
  if (!data) return c.json({ error: 'Transaction not found' }, HTTP_STATUS.NOT_FOUND);
  return c.json({ data });
});

app.post('/transactions', async (c) => {
  const user = getAuthUser(c);
  const rawBody = await readJsonBody(c.req, 'Invalid budget transaction payload');
  if (!rawBody.ok) return c.json({ error: rawBody.error }, HTTP_STATUS.BAD_REQUEST);

  const body = parseBudgetTransactionCreate(rawBody.value);
  if (!body.ok) return c.json({ error: body.error }, HTTP_STATUS.BAD_REQUEST);

  const category = await getOwnedBudgetCategory(body.value.categoryId, user.id);
  if (!category) return c.json({ error: 'Category not found' }, HTTP_STATUS.NOT_FOUND);

  const [data] = await db
    .insert(budgetTransactions)
    .values(toBudgetTransactionInsertValues(body.value, user.id))
    .returning();
  return c.json({ data }, HTTP_STATUS.CREATED);
});

app.patch('/transactions/:id', async (c) => {
  const user = getAuthUser(c);
  const id = parseId(c.req.param('id'));
  if (id === null) return c.json({ error: 'Invalid transaction id' }, HTTP_STATUS.BAD_REQUEST);

  const rawBody = await readJsonBody(c.req, 'Invalid budget transaction payload');
  if (!rawBody.ok) return c.json({ error: rawBody.error }, HTTP_STATUS.BAD_REQUEST);

  const body = parseBudgetTransactionPatch(rawBody.value);
  if (!body.ok) return c.json({ error: body.error }, HTTP_STATUS.BAD_REQUEST);
  if (Object.keys(body.value).length === 0) {
    return c.json({ error: 'No budget transaction fields provided' }, HTTP_STATUS.BAD_REQUEST);
  }

  const existing = await getOwnedBudgetTransaction(id, user.id);
  if (!existing) return c.json({ error: 'Transaction not found' }, HTTP_STATUS.NOT_FOUND);

  const nextCategoryId = body.value.categoryId ?? existing.categoryId;
  if (nextCategoryId !== existing.categoryId) {
    const category = await getOwnedBudgetCategory(nextCategoryId, user.id);
    if (!category) return c.json({ error: 'Category not found' }, HTTP_STATUS.NOT_FOUND);
  }

  const [data] = await db
    .update(budgetTransactions)
    .set(toBudgetTransactionUpdateValues(body.value))
    .where(and(eq(budgetTransactions.id, id), eq(budgetTransactions.userId, user.id)))
    .returning();
  if (!data) return c.json({ error: 'Transaction not found' }, HTTP_STATUS.NOT_FOUND);
  return c.json({ data });
});

app.delete('/transactions/:id', async (c) => {
  const user = getAuthUser(c);
  const id = parseId(c.req.param('id'));
  if (id === null) return c.json({ error: 'Invalid transaction id' }, HTTP_STATUS.BAD_REQUEST);

  const [data] = await db
    .delete(budgetTransactions)
    .where(and(eq(budgetTransactions.id, id), eq(budgetTransactions.userId, user.id)))
    .returning();
  if (!data) return c.json({ error: 'Transaction not found' }, HTTP_STATUS.NOT_FOUND);
  return c.json({ data });
});

export default app;
