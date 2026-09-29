import { and, eq, isNull } from 'drizzle-orm';
import { Hono } from 'hono';
import {
  DEBT_TYPES,
  type DebtType,
  roundMoney,
  validateBalanceWithinOriginal,
  validateInterestWithinAmount,
  type DebtPayload,
  type DebtPaymentPayload,
} from '@quro/shared';
import { HTTP_STATUS } from '../constants/http';
import { db, type DbExecutor } from '../db/client';
import { debtPayments, debts } from '../db/schema';
import { getAuthUser } from '../lib/authUser';
import { applyRepayment, DEBT_BALANCE, reverseRepayment } from '../lib/balance';
import { invalidateSnapshotsFrom } from '../lib/netWorth';
import {
  err,
  type FieldParsers,
  ok,
  parseCurrencyField,
  parseDateField,
  parseId,
  parseIntegerField,
  parseNonEmptyString,
  parseNumberField,
  parseOptionalDateField,
  parsePositiveNumberField,
  parseRequiredFields,
  type ParseResult,
  parseTextField,
  readJsonRecord,
} from '../lib/requestValidation';

const app = new Hono();

type RouteMutationResult =
  { data: unknown } | { error: string; status: (typeof HTTP_STATUS)[keyof typeof HTTP_STATUS] };

function toDebtInsertPayload(payload: DebtPayload, userId: number): typeof debts.$inferInsert {
  return {
    userId,
    name: payload.name,
    type: payload.type,
    lender: payload.lender,
    originalAmount: payload.originalAmount,
    remainingBalance: payload.remainingBalance,
    currency: payload.currency,
    interestRate: payload.interestRate,
    monthlyPayment: payload.monthlyPayment,
    startDate: payload.startDate,
    endDate: payload.endDate,
    color: payload.color,
    emoji: payload.emoji,
    notes: payload.notes,
  };
}

function toDebtUpdatePayload(payload: DebtPayload): Partial<typeof debts.$inferInsert> {
  return {
    name: payload.name,
    type: payload.type,
    lender: payload.lender,
    originalAmount: payload.originalAmount,
    remainingBalance: payload.remainingBalance,
    currency: payload.currency,
    interestRate: payload.interestRate,
    monthlyPayment: payload.monthlyPayment,
    startDate: payload.startDate,
    endDate: payload.endDate,
    color: payload.color,
    emoji: payload.emoji,
    notes: payload.notes,
  };
}

function toDebtPaymentInsertPayload(
  payload: DebtPaymentPayload,
  userId: number,
): typeof debtPayments.$inferInsert {
  return {
    userId,
    debtId: payload.debtId,
    date: payload.date,
    amount: payload.amount,
    interest: payload.interest,
    principal: payload.principal,
    note: payload.note,
  };
}

function parseDebtTypeField(value: unknown): ParseResult<DebtType> {
  return typeof value === 'string' && DEBT_TYPES.includes(value as DebtType)
    ? ok(value as DebtType)
    : err('Invalid debt type');
}

const debtParsers: FieldParsers<DebtPayload> = {
  name: (value) => parseTextField(value, 'Debt name is required'),
  type: parseDebtTypeField,
  lender: (value) => parseTextField(value, 'Lender is required'),
  originalAmount: (value) =>
    parsePositiveNumberField(value, 'Original amount must be greater than zero'),
  remainingBalance: (value) =>
    parseNumberField(value, 'Remaining balance must be zero or greater', 0),
  currency: parseCurrencyField,
  interestRate: (value) => parseNumberField(value, 'Interest rate must be zero or greater', 0),
  monthlyPayment: (value) => parseNumberField(value, 'Monthly payment must be zero or greater', 0),
  startDate: (value) => parseDateField(value, 'Start date must be a valid ISO date'),
  endDate: (value) => parseOptionalDateField(value, 'End date must be a valid ISO date'),
  color: (value) => parseTextField(value, 'Color is required'),
  emoji: (value) => parseTextField(value, 'Emoji is required'),
  notes: (value) => ok(parseNonEmptyString(value)),
};

const debtPaymentParsers: FieldParsers<Omit<DebtPaymentPayload, 'principal'>> = {
  debtId: (value) => parseIntegerField(value, 'Invalid debt id', 1),
  date: (value) => parseDateField(value, 'Payment date must be a valid ISO date'),
  amount: (value) => parsePositiveNumberField(value, 'Payment amount must be greater than zero'),
  interest: (value) => parseNumberField(value, 'Interest must be zero or greater', 0),
  note: (value) => ok(parseNonEmptyString(value) ?? ''),
};

export function computeDebtPrincipal(amount: number, interest: number): number {
  return Math.max(0, roundMoney(amount - interest));
}

export function validateDebtPrincipalAgainstBalance(
  principal: number,
  currentRemainingBalance: number,
): string | null {
  if (principal > currentRemainingBalance) {
    return 'Principal portion cannot exceed the current remaining balance';
  }

  return null;
}

export function parseDebtPayload(raw: Record<string, unknown>): ParseResult<DebtPayload> {
  const parsed = parseRequiredFields(raw, debtParsers);
  if (!parsed.ok) return parsed;

  const { remainingBalance, originalAmount, startDate, endDate } = parsed.value;
  const balanceValidationError = validateBalanceWithinOriginal(originalAmount, remainingBalance);
  if (balanceValidationError) return err(balanceValidationError);
  if (endDate != null && endDate < startDate) {
    return err('End date cannot be earlier than the start date');
  }
  return parsed;
}

export function parseDebtPaymentPayload(
  raw: Record<string, unknown>,
): ParseResult<DebtPaymentPayload> {
  const parsed = parseRequiredFields(raw, debtPaymentParsers);
  if (!parsed.ok) return parsed;

  const { amount, interest } = parsed.value;
  const splitError = validateInterestWithinAmount(amount, interest);
  if (splitError) return err(splitError);
  return ok({ ...parsed.value, principal: computeDebtPrincipal(amount, interest) });
}

// eslint-disable-next-line complexity
function mergeDebtPayload(
  raw: Record<string, unknown>,
  existing: typeof debts.$inferSelect,
): ParseResult<DebtPayload> {
  return parseDebtPayload({
    name: raw.name ?? existing.name,
    type: raw.type ?? existing.type,
    lender: raw.lender ?? existing.lender,
    originalAmount: raw.originalAmount ?? existing.originalAmount,
    remainingBalance: raw.remainingBalance ?? existing.remainingBalance,
    currency: raw.currency ?? existing.currency,
    interestRate: raw.interestRate ?? existing.interestRate,
    monthlyPayment: raw.monthlyPayment ?? existing.monthlyPayment,
    startDate: raw.startDate ?? existing.startDate,
    endDate: raw.endDate === undefined ? existing.endDate : raw.endDate,
    color: raw.color ?? existing.color,
    emoji: raw.emoji ?? existing.emoji,
    notes: raw.notes === undefined ? existing.notes : raw.notes,
  });
}

async function getDebtById(
  tx: DbExecutor,
  userId: number,
  debtId: number,
): Promise<typeof debts.$inferSelect | null> {
  const [existing] = await tx
    .select()
    .from(debts)
    .where(and(eq(debts.id, debtId), eq(debts.userId, userId)));

  return existing ?? null;
}

async function createDebt(params: {
  userId: number;
  raw: Record<string, unknown>;
}): Promise<RouteMutationResult> {
  const parsed = parseDebtPayload(params.raw);
  if (!parsed.ok) return { error: parsed.error, status: HTTP_STATUS.BAD_REQUEST };

  const [data] = await db
    .insert(debts)
    .values(toDebtInsertPayload(parsed.value, params.userId))
    .returning();

  return { data };
}

async function updateDebt(params: {
  userId: number;
  debtId: number;
  raw: Record<string, unknown>;
}): Promise<RouteMutationResult> {
  const existing = await getDebtById(db, params.userId, params.debtId);
  if (!existing) return { error: 'Debt not found', status: HTTP_STATUS.NOT_FOUND };

  const parsed = mergeDebtPayload(params.raw, existing);
  if (!parsed.ok) return { error: parsed.error, status: HTTP_STATUS.BAD_REQUEST };

  const [data] = await db
    .update(debts)
    .set(toDebtUpdatePayload(parsed.value))
    .where(and(eq(debts.id, params.debtId), eq(debts.userId, params.userId)))
    .returning();

  if (!data) return { error: 'Debt not found', status: HTTP_STATUS.NOT_FOUND };
  return { data };
}

async function createDebtPayment(params: {
  userId: number;
  raw: Record<string, unknown>;
}): Promise<RouteMutationResult> {
  const parsed = parseDebtPaymentPayload(params.raw);
  if (!parsed.ok) return { error: parsed.error, status: HTTP_STATUS.BAD_REQUEST };

  return await db.transaction(async (tx) => {
    const debt = await getDebtById(tx, params.userId, parsed.value.debtId);
    if (!debt) return { error: 'Debt not found', status: HTTP_STATUS.NOT_FOUND };

    const updatedBalance = await applyRepayment(tx, DEBT_BALANCE, {
      id: debt.id,
      principal: parsed.value.principal,
      where: eq(debts.userId, params.userId),
    });
    if (updatedBalance === null) {
      return {
        error: 'Principal portion cannot exceed the current remaining balance',
        status: HTTP_STATUS.BAD_REQUEST,
      };
    }

    const [data] = await tx
      .insert(debtPayments)
      .values(toDebtPaymentInsertPayload(parsed.value, params.userId))
      .returning();
    await invalidateSnapshotsFrom(tx, params.userId, parsed.value.date);

    return { data };
  });
}

function deleteDebtPayment(params: {
  userId: number;
  paymentId: number;
}): Promise<RouteMutationResult> {
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(debtPayments)
      .where(and(eq(debtPayments.id, params.paymentId), eq(debtPayments.userId, params.userId)));
    if (!existing) return { error: 'Payment not found', status: HTTP_STATUS.NOT_FOUND };

    const restoredBalance = await reverseRepayment(tx, DEBT_BALANCE, {
      id: existing.debtId,
      principal: existing.principal,
      where: eq(debts.userId, params.userId),
    });
    if (restoredBalance === null) return { error: 'Debt not found', status: HTTP_STATUS.NOT_FOUND };

    const [data] = await tx
      .delete(debtPayments)
      .where(and(eq(debtPayments.id, params.paymentId), eq(debtPayments.userId, params.userId)))
      .returning();
    await invalidateSnapshotsFrom(tx, params.userId, existing.date);

    return { data };
  });
}

app.get('/payments', async (c) => {
  const user = getAuthUser(c);
  const debtIdParam = c.req.query('debtId');
  if (!debtIdParam) {
    const data = await db.select().from(debtPayments).where(eq(debtPayments.userId, user.id));
    return c.json({ data });
  }

  const debtId = parseId(debtIdParam);
  if (debtId == null) return c.json({ error: 'Invalid debt id' }, HTTP_STATUS.BAD_REQUEST);

  const debt = await getDebtById(db, user.id, debtId);
  if (!debt) return c.json({ error: 'Debt not found' }, HTTP_STATUS.NOT_FOUND);

  const data = await db
    .select()
    .from(debtPayments)
    .where(and(eq(debtPayments.userId, user.id), eq(debtPayments.debtId, debtId)));

  return c.json({ data });
});

app.post('/payments', async (c) => {
  const user = getAuthUser(c);
  const body = await readJsonRecord(c.req, 'Invalid debt payment payload');
  if (!body.ok) return c.json({ error: body.error }, HTTP_STATUS.BAD_REQUEST);
  const { userId: _ignoredUserId, principal: _ignoredPrincipal, ...safeBody } = body.value;
  const result = await createDebtPayment({ userId: user.id, raw: safeBody });
  if ('error' in result) return c.json({ error: result.error }, result.status);
  return c.json({ data: result.data }, HTTP_STATUS.CREATED);
});

app.delete('/payments/:id', async (c) => {
  const user = getAuthUser(c);
  const paymentId = parseId(c.req.param('id'));
  if (paymentId == null) return c.json({ error: 'Invalid payment id' }, HTTP_STATUS.BAD_REQUEST);

  const result = await deleteDebtPayment({ userId: user.id, paymentId });
  if ('error' in result) return c.json({ error: result.error }, result.status);
  return c.json({ data: result.data });
});

app.get('/', async (c) => {
  const user = getAuthUser(c);
  const includeArchived = c.req.query('includeArchived') === 'true';
  const data = await db
    .select()
    .from(debts)
    .where(
      includeArchived
        ? eq(debts.userId, user.id)
        : and(eq(debts.userId, user.id), isNull(debts.archivedAt)),
    );
  return c.json({ data });
});

app.get('/:id', async (c) => {
  const user = getAuthUser(c);
  const debtId = parseId(c.req.param('id'));
  if (debtId == null) return c.json({ error: 'Invalid debt id' }, HTTP_STATUS.BAD_REQUEST);

  const data = await getDebtById(db, user.id, debtId);
  if (!data) return c.json({ error: 'Debt not found' }, HTTP_STATUS.NOT_FOUND);
  return c.json({ data });
});

app.post('/', async (c) => {
  const user = getAuthUser(c);
  const body = await readJsonRecord(c.req, 'Invalid debt payload');
  if (!body.ok) return c.json({ error: body.error }, HTTP_STATUS.BAD_REQUEST);
  const { userId: _ignoredUserId, ...safeBody } = body.value;
  const result = await createDebt({ userId: user.id, raw: safeBody });
  if ('error' in result) return c.json({ error: result.error }, result.status);
  return c.json({ data: result.data }, HTTP_STATUS.CREATED);
});

app.patch('/:id', async (c) => {
  const user = getAuthUser(c);
  const debtId = parseId(c.req.param('id'));
  if (debtId == null) return c.json({ error: 'Invalid debt id' }, HTTP_STATUS.BAD_REQUEST);

  const body = await readJsonRecord(c.req, 'Invalid debt payload');
  if (!body.ok) return c.json({ error: body.error }, HTTP_STATUS.BAD_REQUEST);
  const { userId: _ignoredUserId, ...safeBody } = body.value;
  const result = await updateDebt({ userId: user.id, debtId, raw: safeBody });
  if ('error' in result) return c.json({ error: result.error }, result.status);
  return c.json({ data: result.data });
});

app.delete('/:id', async (c) => {
  const user = getAuthUser(c);
  const debtId = parseId(c.req.param('id'));
  if (debtId == null) return c.json({ error: 'Invalid debt id' }, HTTP_STATUS.BAD_REQUEST);

  if (c.req.query('cascade') === 'true') {
    const [data] = await db
      .delete(debts)
      .where(and(eq(debts.id, debtId), eq(debts.userId, user.id)))
      .returning();
    if (!data) return c.json({ error: 'Debt not found' }, HTTP_STATUS.NOT_FOUND);
    return c.json({ data });
  }

  const [data] = await db
    .update(debts)
    .set({ archivedAt: new Date() })
    .where(and(eq(debts.id, debtId), eq(debts.userId, user.id), isNull(debts.archivedAt)))
    .returning();
  if (!data) return c.json({ error: 'Debt not found' }, HTTP_STATUS.NOT_FOUND);
  return c.json({ data });
});

app.post('/:id/unarchive', async (c) => {
  const user = getAuthUser(c);
  const debtId = parseId(c.req.param('id'));
  if (debtId == null) return c.json({ error: 'Invalid debt id' }, HTTP_STATUS.BAD_REQUEST);

  const [data] = await db
    .update(debts)
    .set({ archivedAt: null })
    .where(and(eq(debts.id, debtId), eq(debts.userId, user.id)))
    .returning();
  if (!data) return c.json({ error: 'Debt not found' }, HTTP_STATUS.NOT_FOUND);
  return c.json({ data });
});

export default app;
