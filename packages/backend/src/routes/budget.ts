import { and, desc, eq, gte, lt, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import {
  EXPENSE_CLASSES,
  isBudgetMonth,
  toBudgetMonthIndex,
  type BudgetMonth,
  type ExpenseClass,
} from '@quro/shared';
import { HTTP_STATUS } from '../constants/http';
import { db } from '../db/client';
import { budgetCategories, budgetTransactions, categoryMappings } from '../db/schema';
import { getAuthUser } from '../lib/authUser';
import { hasPostgresErrorCode } from '../lib/postgresErrors';
import {
  err,
  ok,
  parseDateField,
  parseId,
  parseIntegerField,
  isRecord,
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
const DEFAULT_TRANSACTION_LIMIT = 100;
const PG_FOREIGN_KEY_VIOLATION = '23503';

function isForeignKeyViolation(error: unknown): boolean {
  return hasPostgresErrorCode(error, PG_FOREIGN_KEY_VIOLATION);
}

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

type MonthYearFilter = { month: BudgetMonth; year: number } | null;

function parseMonthYearFilter(
  rawMonth: string | undefined,
  rawYear: string | undefined,
): MonthYearFilter | 'invalid' {
  if (!rawMonth && !rawYear) return null;
  if (!rawMonth || !rawYear) return 'invalid';
  if (!isBudgetMonth(rawMonth)) return 'invalid';
  const year = parseInt(rawYear, 10);
  if (!Number.isFinite(year) || year < MIN_BUDGET_YEAR || year > MAX_BUDGET_YEAR) return 'invalid';
  return { month: rawMonth, year };
}

function monthYearToDateRange(month: BudgetMonth, year: number): { start: string; end: string } {
  const monthIndex = toBudgetMonthIndex(month);
  const start = `${year}-${String(monthIndex + 1).padStart(2, '0')}-01`;
  const nextMonth = monthIndex === 11 ? 1 : monthIndex + 2;
  const nextYear = monthIndex === 11 ? year + 1 : year;
  const end = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;
  return { start, end };
}

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
type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

function parseBudgetMonthField(value: unknown): ParseResult<BudgetMonth> {
  return isBudgetMonth(value) ? ok(value) : err('Invalid month');
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

async function readBudgetTransactionPatch(
  request: Pick<Request, 'json'>,
): Promise<ParseResult<Partial<BudgetTransactionPayload>>> {
  const rawBody = await readJsonBody(request, 'Invalid budget transaction payload');
  if (!rawBody.ok) return rawBody;

  const body = parseBudgetTransactionPatch(rawBody.value);
  if (!body.ok) return body;
  return Object.keys(body.value).length === 0 ? err('No budget transaction fields provided') : body;
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
    budgeted: payload.budgeted,
    spent: payload.spent,
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
    budgeted: payload.budgeted,
    spent: payload.spent,
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
    amount: payload.amount,
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
    amount: payload.amount,
    date: payload.date,
    merchant: payload.merchant,
  };
}

async function adjustCategorySpent(
  tx: DbTransaction,
  categoryId: number,
  delta: number,
): Promise<void> {
  await tx
    .update(budgetCategories)
    .set({ spent: sql`GREATEST(0, ${budgetCategories.spent} + ${delta}::numeric)` })
    .where(eq(budgetCategories.id, categoryId));
}

// ── Categories ───────────────────────────────────────────────────────────────

type CategoryClassificationUpdate = { id: number; expenseClass: ExpenseClass };

function parseCategoryClassification(value: unknown): ParseResult<CategoryClassificationUpdate> {
  if (!isRecord(value)) return err('Invalid category classification');
  const id = typeof value.id === 'number' ? value.id : Number(value.id);
  const expenseClass = value.expenseClass;
  if (!Number.isInteger(id) || id <= 0) return err('Invalid category classification');
  if (typeof expenseClass !== 'string' || !EXPENSE_CLASSES.includes(expenseClass as ExpenseClass)) {
    return err('Invalid category classification');
  }
  return ok({ id, expenseClass: expenseClass as ExpenseClass });
}

function parseCategoryClassifications(
  payload: unknown,
): ParseResult<CategoryClassificationUpdate[]> {
  if (!isRecord(payload) || !Array.isArray(payload.updates)) {
    return err('Invalid category classification payload');
  }
  const rejected = rejectUnknownFields(payload, ['updates']);
  if (!rejected.ok) return rejected;
  if (payload.updates.length === 0) return err('At least one category update is required');
  const updates: CategoryClassificationUpdate[] = [];
  for (const value of payload.updates) {
    const parsed = parseCategoryClassification(value);
    if (!parsed.ok) return parsed;
    updates.push(parsed.value);
  }
  return ok(updates);
}

function classifyBudgetCategories(
  userId: number,
  updates: readonly CategoryClassificationUpdate[],
) {
  return db.transaction(async (tx) => {
    const updatedRows: Array<typeof budgetCategories.$inferSelect> = [];
    for (const update of updates) {
      const [category] = await tx
        .select()
        .from(budgetCategories)
        .where(and(eq(budgetCategories.id, update.id), eq(budgetCategories.userId, userId)));
      if (!category) return null;
      const rows = await tx
        .update(budgetCategories)
        .set({ expenseClass: update.expenseClass })
        .where(and(eq(budgetCategories.userId, userId), eq(budgetCategories.name, category.name)))
        .returning();
      updatedRows.push(...rows);
    }
    return updatedRows;
  });
}

app.get('/categories', async (c) => {
  const user = getAuthUser(c);
  const filter = parseMonthYearFilter(c.req.query('month'), c.req.query('year'));
  if (filter === 'invalid')
    return c.json({ error: 'Invalid month or year' }, HTTP_STATUS.BAD_REQUEST);

  const conditions = [eq(budgetCategories.userId, user.id)];
  if (filter) {
    conditions.push(eq(budgetCategories.month, filter.month));
    conditions.push(eq(budgetCategories.year, filter.year));
  }

  const data = await db
    .select()
    .from(budgetCategories)
    .where(and(...conditions));
  return c.json({ data });
});

app.patch('/categories/classify', async (c) => {
  const user = getAuthUser(c);
  const rawBody = await readJsonBody(c.req, 'Invalid category classification payload');
  if (!rawBody.ok) return c.json({ error: rawBody.error }, HTTP_STATUS.BAD_REQUEST);
  const parsed = parseCategoryClassifications(rawBody.value);
  if (!parsed.ok) return c.json({ error: parsed.error }, HTTP_STATUS.BAD_REQUEST);
  const data = await classifyBudgetCategories(user.id, parsed.value);
  return data ? c.json({ data }) : c.json({ error: 'Category not found' }, HTTP_STATUS.NOT_FOUND);
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

  let data;
  try {
    [data] = await db
      .delete(budgetCategories)
      .where(and(eq(budgetCategories.id, id), eq(budgetCategories.userId, user.id)))
      .returning();
  } catch (error) {
    if (isForeignKeyViolation(error)) {
      return c.json(
        { error: 'Cannot delete a category with existing transactions' },
        HTTP_STATUS.CONFLICT,
      );
    }
    throw error;
  }
  if (!data) return c.json({ error: 'Category not found' }, HTTP_STATUS.NOT_FOUND);
  return c.json({ data });
});

// ── Transactions ─────────────────────────────────────────────────────────────

app.get('/transactions', async (c) => {
  const user = getAuthUser(c);
  const categoryId = c.req.query('categoryId');
  const filter = parseMonthYearFilter(c.req.query('month'), c.req.query('year'));
  if (filter === 'invalid')
    return c.json({ error: 'Invalid month or year' }, HTTP_STATUS.BAD_REQUEST);

  const conditions = [eq(budgetTransactions.userId, user.id)];

  if (categoryId) {
    const parsedCategoryId = parseId(categoryId);
    if (parsedCategoryId === null)
      return c.json({ error: 'Invalid category id' }, HTTP_STATUS.BAD_REQUEST);
    conditions.push(eq(budgetTransactions.categoryId, parsedCategoryId));
  }

  if (filter) {
    const { start, end } = monthYearToDateRange(filter.month, filter.year);
    conditions.push(gte(budgetTransactions.date, start));
    conditions.push(lt(budgetTransactions.date, end));
  }

  const query = db
    .select()
    .from(budgetTransactions)
    .where(and(...conditions));
  const data =
    filter || categoryId
      ? await query
      : await query
          .orderBy(desc(budgetTransactions.date), desc(budgetTransactions.id))
          .limit(DEFAULT_TRANSACTION_LIMIT);
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

  const [data] = await db.transaction(async (tx) => {
    const inserted = await tx
      .insert(budgetTransactions)
      .values(toBudgetTransactionInsertValues(body.value, user.id))
      .returning();
    await adjustCategorySpent(tx, body.value.categoryId, body.value.amount);
    return inserted;
  });
  return c.json({ data }, HTTP_STATUS.CREATED);
});

app.patch('/transactions/:id', async (c) => {
  const user = getAuthUser(c);
  const id = parseId(c.req.param('id'));
  if (id === null) return c.json({ error: 'Invalid transaction id' }, HTTP_STATUS.BAD_REQUEST);

  const body = await readBudgetTransactionPatch(c.req);
  if (!body.ok) return c.json({ error: body.error }, HTTP_STATUS.BAD_REQUEST);

  const result = await db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(budgetTransactions)
      .where(and(eq(budgetTransactions.id, id), eq(budgetTransactions.userId, user.id)));
    if (!existing) return null;

    const nextCategoryId = body.value.categoryId ?? existing.categoryId;
    const categoryChanging = nextCategoryId !== existing.categoryId;
    if (categoryChanging) {
      const [category] = await tx
        .select({ id: budgetCategories.id })
        .from(budgetCategories)
        .where(and(eq(budgetCategories.id, nextCategoryId), eq(budgetCategories.userId, user.id)));
      if (!category) return 'category-not-found' as const;
    }

    const [updated] = await tx
      .update(budgetTransactions)
      .set(toBudgetTransactionUpdateValues(body.value))
      .where(and(eq(budgetTransactions.id, id), eq(budgetTransactions.userId, user.id)))
      .returning();
    if (!updated) return null;

    const existingAmount = Number(existing.amount);
    const nextAmount = body.value.amount ?? existingAmount;
    if (nextCategoryId !== existing.categoryId) {
      await adjustCategorySpent(tx, existing.categoryId, -existingAmount);
      await adjustCategorySpent(tx, nextCategoryId, nextAmount);
    } else if (nextAmount !== existingAmount) {
      await adjustCategorySpent(tx, existing.categoryId, nextAmount - existingAmount);
    }
    return updated;
  });
  if (result === 'category-not-found') {
    return c.json({ error: 'Category not found' }, HTTP_STATUS.NOT_FOUND);
  }
  const data = result;
  if (!data) return c.json({ error: 'Transaction not found' }, HTTP_STATUS.NOT_FOUND);
  return c.json({ data });
});

app.delete('/transactions/:id', async (c) => {
  const user = getAuthUser(c);
  const id = parseId(c.req.param('id'));
  if (id === null) return c.json({ error: 'Invalid transaction id' }, HTTP_STATUS.BAD_REQUEST);

  const existing = await getOwnedBudgetTransaction(id, user.id);
  if (!existing) return c.json({ error: 'Transaction not found' }, HTTP_STATUS.NOT_FOUND);

  const [data] = await db.transaction(async (tx) => {
    const deleted = await tx
      .delete(budgetTransactions)
      .where(and(eq(budgetTransactions.id, id), eq(budgetTransactions.userId, user.id)))
      .returning();
    if (deleted[0]) {
      await adjustCategorySpent(tx, deleted[0].categoryId, -Number(deleted[0].amount));
    }
    return deleted;
  });
  if (!data) return c.json({ error: 'Transaction not found' }, HTTP_STATUS.NOT_FOUND);

  return c.json({ data });
});

// ── Category mappings ─────────────────────────────────────────────────────────

app.get('/category-mappings', async (c) => {
  const user = getAuthUser(c);
  const data = await db.select().from(categoryMappings).where(eq(categoryMappings.userId, user.id));
  return c.json({ data });
});

app.patch('/category-mappings/:id', async (c) => {
  const user = getAuthUser(c);
  const id = parseId(c.req.param('id'));
  if (id === null) return c.json({ error: 'Invalid mapping id' }, HTTP_STATUS.BAD_REQUEST);

  const rawBody = await readJsonBody(c.req, 'Invalid mapping payload');
  if (!rawBody.ok) return c.json({ error: rawBody.error }, HTTP_STATUS.BAD_REQUEST);
  if (!isRecord(rawBody.value)) {
    return c.json({ error: 'Invalid mapping payload' }, HTTP_STATUS.BAD_REQUEST);
  }

  const rejected = rejectUnknownFields(rawBody.value, ['categoryName']);
  if (!rejected.ok) return c.json({ error: rejected.error }, HTTP_STATUS.BAD_REQUEST);

  const categoryName = parseTextField(rawBody.value.categoryName, 'categoryName');
  if (!categoryName.ok) return c.json({ error: categoryName.error }, HTTP_STATUS.BAD_REQUEST);

  const [data] = await db
    .update(categoryMappings)
    .set({ categoryName: categoryName.value })
    .where(and(eq(categoryMappings.id, id), eq(categoryMappings.userId, user.id)))
    .returning();
  if (!data) return c.json({ error: 'Mapping not found' }, HTTP_STATUS.NOT_FOUND);
  return c.json({ data });
});

export default app;
