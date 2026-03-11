import { and, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { DEBT_TYPES, isCurrencyCode, type CurrencyCode, type DebtType } from '@quro/shared';
import { HTTP_STATUS } from '../constants/http';
import { db } from '../db/client';
import { debtPayments, debts } from '../db/schema';
import { getAuthUser } from '../lib/authUser';

const app = new Hono();
const MAX_INT32 = 2_147_483_647;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

type ValidationResult<T> = { ok: true; data: T } | { ok: false; error: string };

type DebtPayload = {
  name: string;
  type: DebtType;
  lender: string;
  originalAmount: number;
  remainingBalance: number;
  currency: CurrencyCode;
  interestRate: number;
  monthlyPayment: number;
  startDate: string;
  endDate: string | null;
  color: string;
  emoji: string;
  notes: string | null;
};

type DebtPaymentPayload = {
  debtId: number;
  date: string;
  amount: number;
  interest: number;
  principal: number;
  note: string;
};

type RouteMutationResult =
  | { data: unknown }
  | { error: string; status: (typeof HTTP_STATUS)[keyof typeof HTTP_STATUS] };

function toDebtInsertPayload(payload: DebtPayload, userId: number): typeof debts.$inferInsert {
  return {
    userId,
    name: payload.name,
    type: payload.type,
    lender: payload.lender,
    originalAmount: payload.originalAmount.toString(),
    remainingBalance: payload.remainingBalance.toString(),
    currency: payload.currency,
    interestRate: payload.interestRate.toString(),
    monthlyPayment: payload.monthlyPayment.toString(),
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
    originalAmount: payload.originalAmount.toString(),
    remainingBalance: payload.remainingBalance.toString(),
    currency: payload.currency,
    interestRate: payload.interestRate.toString(),
    monthlyPayment: payload.monthlyPayment.toString(),
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
    amount: payload.amount.toString(),
    interest: payload.interest.toString(),
    principal: payload.principal.toString(),
    note: payload.note,
  };
}

function parseId(value: string): number | null {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > MAX_INT32) return null;
  return parsed;
}

function normalizeBody(body: unknown): Record<string, unknown> {
  return body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
}

function toFiniteNumber(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number.parseFloat(String(value ?? ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function parseRequiredString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseOptionalString(value: unknown): string | null {
  return parseRequiredString(value);
}

function parseIsoDate(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return ISO_DATE_PATTERN.test(trimmed) ? trimmed : null;
}

function parseDebtType(value: unknown): DebtType | null {
  return typeof value === 'string' && DEBT_TYPES.includes(value as DebtType)
    ? (value as DebtType)
    : null;
}

function parseDebtBalance(value: unknown): number {
  return Number.parseFloat(String(value ?? '0')) || 0;
}

export function validateDebtBalance(
  originalAmount: number,
  remainingBalance: number,
): string | null {
  if (remainingBalance > originalAmount) {
    return 'Remaining balance cannot exceed the original amount';
  }

  return null;
}

export function computeDebtPrincipal(amount: number, interest: number): number {
  return Math.max(0, Number.parseFloat((amount - interest).toFixed(2)));
}

function adjustDebtRemainingBalance(currentRemainingBalance: number, delta: number): number {
  return Number.parseFloat((currentRemainingBalance + delta).toFixed(2));
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

export function applyDebtPrincipalPayment(
  currentRemainingBalance: number,
  principal: number,
): number {
  return adjustDebtRemainingBalance(currentRemainingBalance, -principal);
}

export function restoreDebtPrincipalPayment(
  currentRemainingBalance: number,
  principal: number,
): number {
  return adjustDebtRemainingBalance(currentRemainingBalance, principal);
}

// eslint-disable-next-line complexity, sonarjs/cognitive-complexity
export function parseDebtPayload(raw: Record<string, unknown>): ValidationResult<DebtPayload> {
  const name = parseRequiredString(raw.name);
  if (!name) return { ok: false, error: 'Debt name is required' };

  const type = parseDebtType(raw.type);
  if (!type) return { ok: false, error: 'Invalid debt type' };

  const lender = parseRequiredString(raw.lender);
  if (!lender) return { ok: false, error: 'Lender is required' };

  const originalAmount = toFiniteNumber(raw.originalAmount);
  if (originalAmount == null || originalAmount <= 0) {
    return { ok: false, error: 'Original amount must be greater than zero' };
  }

  const remainingBalance = toFiniteNumber(raw.remainingBalance);
  if (remainingBalance == null || remainingBalance < 0) {
    return { ok: false, error: 'Remaining balance must be zero or greater' };
  }
  const balanceValidationError = validateDebtBalance(originalAmount, remainingBalance);
  if (balanceValidationError) return { ok: false, error: balanceValidationError };

  if (!isCurrencyCode(raw.currency)) return { ok: false, error: 'Invalid currency' };

  const interestRate = toFiniteNumber(raw.interestRate);
  if (interestRate == null || interestRate < 0) {
    return { ok: false, error: 'Interest rate must be zero or greater' };
  }

  const monthlyPayment = toFiniteNumber(raw.monthlyPayment);
  if (monthlyPayment == null || monthlyPayment < 0) {
    return { ok: false, error: 'Monthly payment must be zero or greater' };
  }

  const startDate = parseIsoDate(raw.startDate);
  if (!startDate) return { ok: false, error: 'Start date must be a valid ISO date' };

  const rawEndDate = raw.endDate;
  const endDate = rawEndDate == null || rawEndDate === '' ? null : parseIsoDate(rawEndDate);
  if (rawEndDate != null && rawEndDate !== '' && !endDate) {
    return { ok: false, error: 'End date must be a valid ISO date' };
  }
  if (endDate != null && endDate < startDate) {
    return { ok: false, error: 'End date cannot be earlier than the start date' };
  }

  const color = parseRequiredString(raw.color);
  if (!color) return { ok: false, error: 'Color is required' };

  const emoji = parseRequiredString(raw.emoji);
  if (!emoji) return { ok: false, error: 'Emoji is required' };

  return {
    ok: true,
    data: {
      name,
      type,
      lender,
      originalAmount,
      remainingBalance,
      currency: raw.currency,
      interestRate,
      monthlyPayment,
      startDate,
      endDate,
      color,
      emoji,
      notes: parseOptionalString(raw.notes),
    },
  };
}

export function parseDebtPaymentPayload(
  raw: Record<string, unknown>,
): ValidationResult<DebtPaymentPayload> {
  const debtId = parseId(String(raw.debtId ?? ''));
  if (debtId == null) return { ok: false, error: 'Invalid debt id' };

  const date = parseIsoDate(raw.date);
  if (!date) return { ok: false, error: 'Payment date must be a valid ISO date' };

  const amount = toFiniteNumber(raw.amount);
  if (amount == null || amount <= 0) {
    return { ok: false, error: 'Payment amount must be greater than zero' };
  }

  const interest = toFiniteNumber(raw.interest);
  if (interest == null || interest < 0) {
    return { ok: false, error: 'Interest must be zero or greater' };
  }
  if (interest > amount) return { ok: false, error: 'Interest cannot exceed total payment' };

  return {
    ok: true,
    data: {
      debtId,
      date,
      amount,
      interest,
      principal: computeDebtPrincipal(amount, interest),
      note: parseOptionalString(raw.note) ?? '',
    },
  };
}

// eslint-disable-next-line complexity
function mergeDebtPayload(
  raw: Record<string, unknown>,
  existing: typeof debts.$inferSelect,
): ValidationResult<DebtPayload> {
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
  tx: DbTransaction | typeof db,
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
    .values(toDebtInsertPayload(parsed.data, params.userId))
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
    .set(toDebtUpdatePayload(parsed.data))
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
    const debt = await getDebtById(tx, params.userId, parsed.data.debtId);
    if (!debt) return { error: 'Debt not found', status: HTTP_STATUS.NOT_FOUND };

    const currentRemainingBalance = parseDebtBalance(debt.remainingBalance);
    const principalValidationError = validateDebtPrincipalAgainstBalance(
      parsed.data.principal,
      currentRemainingBalance,
    );
    if (principalValidationError) {
      return {
        error: principalValidationError,
        status: HTTP_STATUS.BAD_REQUEST,
      };
    }

    const [data] = await tx
      .insert(debtPayments)
      .values(toDebtPaymentInsertPayload(parsed.data, params.userId))
      .returning();

    await tx
      .update(debts)
      .set({
        remainingBalance: applyDebtPrincipalPayment(
          currentRemainingBalance,
          parsed.data.principal,
        ).toString(),
      })
      .where(and(eq(debts.id, debt.id), eq(debts.userId, params.userId)));

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

    const debt = await getDebtById(tx, params.userId, existing.debtId);
    if (!debt) return { error: 'Debt not found', status: HTTP_STATUS.NOT_FOUND };

    await tx
      .update(debts)
      .set({
        remainingBalance: restoreDebtPrincipalPayment(
          parseDebtBalance(debt.remainingBalance),
          parseDebtBalance(existing.principal),
        ).toString(),
      })
      .where(and(eq(debts.id, debt.id), eq(debts.userId, params.userId)));

    const [data] = await tx
      .delete(debtPayments)
      .where(and(eq(debtPayments.id, params.paymentId), eq(debtPayments.userId, params.userId)))
      .returning();

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
  const body = normalizeBody(await c.req.json());
  const { userId: _ignoredUserId, principal: _ignoredPrincipal, ...safeBody } = body;
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
  const data = await db.select().from(debts).where(eq(debts.userId, user.id));
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
  const body = normalizeBody(await c.req.json());
  const { userId: _ignoredUserId, ...safeBody } = body;
  const result = await createDebt({ userId: user.id, raw: safeBody });
  if ('error' in result) return c.json({ error: result.error }, result.status);
  return c.json({ data: result.data }, HTTP_STATUS.CREATED);
});

app.patch('/:id', async (c) => {
  const user = getAuthUser(c);
  const debtId = parseId(c.req.param('id'));
  if (debtId == null) return c.json({ error: 'Invalid debt id' }, HTTP_STATUS.BAD_REQUEST);

  const body = normalizeBody(await c.req.json());
  const { userId: _ignoredUserId, ...safeBody } = body;
  const result = await updateDebt({ userId: user.id, debtId, raw: safeBody });
  if ('error' in result) return c.json({ error: result.error }, result.status);
  return c.json({ data: result.data });
});

app.delete('/:id', async (c) => {
  const user = getAuthUser(c);
  const debtId = parseId(c.req.param('id'));
  if (debtId == null) return c.json({ error: 'Invalid debt id' }, HTTP_STATUS.BAD_REQUEST);

  const [data] = await db
    .delete(debts)
    .where(and(eq(debts.id, debtId), eq(debts.userId, user.id)))
    .returning();

  if (!data) return c.json({ error: 'Debt not found' }, HTTP_STATUS.NOT_FOUND);
  return c.json({ data });
});

export default app;
