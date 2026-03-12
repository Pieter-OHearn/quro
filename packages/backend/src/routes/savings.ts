import { and, eq, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { HTTP_STATUS } from '../constants/http';
import { db } from '../db/client';
import { savingsAccounts, savingsTransactions } from '../db/schema';
import { getAuthUser } from '../lib/authUser';
import {
  err,
  ok,
  parseCurrencyField,
  parseDateField,
  parseId,
  parseIntegerField,
  parseNumber,
  parseNumberField,
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

const SAVINGS_ACCOUNT_FIELDS = [
  'name',
  'bank',
  'balance',
  'currency',
  'interestRate',
  'accountType',
  'color',
  'emoji',
] as const;
const SAVINGS_TRANSACTION_FIELDS = ['accountId', 'type', 'amount', 'date', 'note'] as const;
const SAVINGS_ACCOUNT_TYPES = ['Easy Access', 'Term Deposit'] as const;
const SAVINGS_TRANSACTION_TYPES = ['deposit', 'withdrawal', 'interest'] as const;

type SavingsAccountType = (typeof SAVINGS_ACCOUNT_TYPES)[number];
type SavingsTransactionType = (typeof SAVINGS_TRANSACTION_TYPES)[number];

type SavingsAccountPayload = {
  name: string;
  bank: string;
  balance: number;
  currency: 'EUR' | 'GBP' | 'USD' | 'AUD' | 'NZD' | 'CAD' | 'CHF' | 'SGD';
  interestRate: number;
  accountType: SavingsAccountType;
  color: string;
  emoji: string;
};

type SavingsTransactionPayload = {
  accountId: number;
  type: SavingsTransactionType;
  amount: number;
  date: string;
  note: string | null;
};

type SavingsAccountInsert = typeof savingsAccounts.$inferInsert;
type SavingsTransactionInsert = typeof savingsTransactions.$inferInsert;

function parseSavingsAccountTypeField(value: unknown): ParseResult<SavingsAccountType> {
  return typeof value === 'string' && SAVINGS_ACCOUNT_TYPES.includes(value as SavingsAccountType)
    ? ok(value as SavingsAccountType)
    : err('Invalid account type');
}

function parseSavingsTransactionTypeField(value: unknown): ParseResult<SavingsTransactionType> {
  return typeof value === 'string' &&
    SAVINGS_TRANSACTION_TYPES.includes(value as SavingsTransactionType)
    ? ok(value as SavingsTransactionType)
    : err('Invalid transaction type');
}

function parsePositiveNumberField(value: unknown, error: string): ParseResult<number> {
  const parsed = parseNumber(value);
  return parsed === null || parsed <= 0 ? err(error) : ok(parsed);
}

const savingsAccountParsers: FieldParsers<SavingsAccountPayload> = {
  name: (value) => parseTextField(value, 'Account name is required'),
  bank: (value) => parseTextField(value, 'Bank is required'),
  balance: (value) => parseNumberField(value, 'Balance must be zero or greater', 0),
  currency: parseCurrencyField,
  interestRate: (value) => parseNumberField(value, 'Interest rate must be zero or greater', 0),
  accountType: parseSavingsAccountTypeField,
  color: (value) => parseTextField(value, 'Color is required'),
  emoji: (value) => parseTextField(value, 'Emoji is required'),
};

const savingsTransactionParsers: FieldParsers<SavingsTransactionPayload> = {
  accountId: (value) => parseIntegerField(value, 'Invalid account id', 1),
  type: parseSavingsTransactionTypeField,
  amount: (value) =>
    parsePositiveNumberField(value, 'Transaction amount must be greater than zero'),
  date: (value) => parseDateField(value, 'Transaction date must be a valid ISO date'),
  note: (value) => parseOptionalTextField(value, 'Transaction note must be a string'),
};

function parseSavingsAccountCreate(body: unknown): ParseResult<SavingsAccountPayload> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return err('Invalid savings account payload');
  }
  const strictCheck = rejectUnknownFields(body as Record<string, unknown>, SAVINGS_ACCOUNT_FIELDS);
  if (!strictCheck.ok) return strictCheck;
  return parseRequiredFields(body as Record<string, unknown>, savingsAccountParsers);
}

function parseSavingsAccountPatch(body: unknown): ParseResult<Partial<SavingsAccountPayload>> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return err('Invalid savings account payload');
  }
  const strictCheck = rejectUnknownFields(body as Record<string, unknown>, SAVINGS_ACCOUNT_FIELDS);
  if (!strictCheck.ok) return strictCheck;
  return parsePatchFields(body as Record<string, unknown>, savingsAccountParsers);
}

function parseSavingsTransactionCreate(body: unknown): ParseResult<SavingsTransactionPayload> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return err('Invalid savings transaction payload');
  }
  const strictCheck = rejectUnknownFields(
    body as Record<string, unknown>,
    SAVINGS_TRANSACTION_FIELDS,
  );
  if (!strictCheck.ok) return strictCheck;
  return parseRequiredFields(body as Record<string, unknown>, savingsTransactionParsers);
}

function parseSavingsTransactionPatch(
  body: unknown,
): ParseResult<Partial<SavingsTransactionPayload>> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return err('Invalid savings transaction payload');
  }
  const strictCheck = rejectUnknownFields(
    body as Record<string, unknown>,
    SAVINGS_TRANSACTION_FIELDS,
  );
  if (!strictCheck.ok) return strictCheck;
  return parsePatchFields(body as Record<string, unknown>, savingsTransactionParsers);
}

function toFiniteNumber(value: unknown): number {
  const parsed = parseNumber(value);
  return parsed ?? 0;
}

function toSavingsAccountInsertValues(
  payload: SavingsAccountPayload,
  userId: number,
): SavingsAccountInsert {
  return {
    userId,
    name: payload.name,
    bank: payload.bank,
    balance: payload.balance.toString(),
    currency: payload.currency,
    interestRate: payload.interestRate.toString(),
    accountType: payload.accountType,
    color: payload.color,
    emoji: payload.emoji,
  };
}

function toSavingsAccountUpdateValues(
  payload: Partial<SavingsAccountPayload>,
): Partial<SavingsAccountInsert> {
  return {
    name: payload.name,
    bank: payload.bank,
    balance: payload.balance?.toString(),
    currency: payload.currency,
    interestRate: payload.interestRate?.toString(),
    accountType: payload.accountType,
    color: payload.color,
    emoji: payload.emoji,
  };
}

function toSavingsTransactionInsertValues(
  payload: SavingsTransactionPayload,
  userId: number,
): SavingsTransactionInsert {
  return {
    userId,
    accountId: payload.accountId,
    type: payload.type,
    amount: payload.amount.toString(),
    date: payload.date,
    note: payload.note,
  };
}

function toSavingsTransactionUpdateValues(
  payload: Partial<SavingsTransactionPayload>,
): Partial<SavingsTransactionInsert> {
  return {
    accountId: payload.accountId,
    type: payload.type,
    amount: payload.amount?.toString(),
    date: payload.date,
    note: payload.note,
  };
}

function toSignedSavingsAmount(type: unknown, amount: unknown): number {
  const absoluteAmount = Math.abs(toFiniteNumber(amount));
  return type === 'withdrawal' ? -absoluteAmount : absoluteAmount;
}

async function getOwnedSavingsAccount(accountId: number, userId: number) {
  const [account] = await db
    .select()
    .from(savingsAccounts)
    .where(and(eq(savingsAccounts.id, accountId), eq(savingsAccounts.userId, userId)));
  return account ?? null;
}

async function getOwnedSavingsTransaction(transactionId: number, userId: number) {
  const [transaction] = await db
    .select()
    .from(savingsTransactions)
    .where(and(eq(savingsTransactions.id, transactionId), eq(savingsTransactions.userId, userId)));
  return transaction ?? null;
}

async function updateSavingsAccountBalanceByDelta(
  accountId: number,
  userId: number,
  delta: number,
): Promise<void> {
  if (delta === 0) return;
  await db
    .update(savingsAccounts)
    .set({
      balance: sql`CAST(${savingsAccounts.balance} AS numeric) + ${delta}`,
    })
    .where(and(eq(savingsAccounts.id, accountId), eq(savingsAccounts.userId, userId)));
}

async function syncSavingsBalancesForEditedTransaction(params: {
  userId: number;
  previousAccountId: number;
  nextAccountId: number;
  previousType: unknown;
  nextType: unknown;
  previousAmount: unknown;
  nextAmount: unknown;
}): Promise<void> {
  const oldSignedAmount = toSignedSavingsAmount(params.previousType, params.previousAmount);
  const newSignedAmount = toSignedSavingsAmount(params.nextType, params.nextAmount);

  if (params.nextAccountId === params.previousAccountId) {
    await updateSavingsAccountBalanceByDelta(
      params.previousAccountId,
      params.userId,
      newSignedAmount - oldSignedAmount,
    );
    return;
  }

  await updateSavingsAccountBalanceByDelta(
    params.previousAccountId,
    params.userId,
    -oldSignedAmount,
  );
  await updateSavingsAccountBalanceByDelta(params.nextAccountId, params.userId, newSignedAmount);
}

function resolveNextSavingsTransactionState(
  patch: Partial<SavingsTransactionPayload>,
  existing: typeof savingsTransactions.$inferSelect,
) {
  return {
    accountId: patch.accountId ?? existing.accountId,
    type: patch.type ?? existing.type,
    amount: patch.amount ?? toFiniteNumber(existing.amount),
  };
}

async function validatePatchedSavingsTransactionAccount(params: {
  userId: number;
  previousAccountId: number;
  nextAccountId: number;
}): Promise<string | null> {
  if (params.nextAccountId === params.previousAccountId) return null;
  const account = await getOwnedSavingsAccount(params.nextAccountId, params.userId);
  return account ? null : 'Account not found';
}

// ── Accounts ─────────────────────────────────────────────────────────────────

app.get('/accounts', async (c) => {
  const user = getAuthUser(c);
  const data = await db.select().from(savingsAccounts).where(eq(savingsAccounts.userId, user.id));
  return c.json({ data });
});

app.get('/accounts/:id', async (c) => {
  const user = getAuthUser(c);
  const id = parseId(c.req.param('id'));
  if (id === null) return c.json({ error: 'Invalid account id' }, HTTP_STATUS.BAD_REQUEST);

  const data = await getOwnedSavingsAccount(id, user.id);
  if (!data) return c.json({ error: 'Account not found' }, HTTP_STATUS.NOT_FOUND);
  return c.json({ data });
});

app.post('/accounts', async (c) => {
  const user = getAuthUser(c);
  const rawBody = await readJsonBody(c.req, 'Invalid savings account payload');
  if (!rawBody.ok) return c.json({ error: rawBody.error }, HTTP_STATUS.BAD_REQUEST);

  const body = parseSavingsAccountCreate(rawBody.value);
  if (!body.ok) return c.json({ error: body.error }, HTTP_STATUS.BAD_REQUEST);

  const [data] = await db
    .insert(savingsAccounts)
    .values(toSavingsAccountInsertValues(body.value, user.id))
    .returning();
  return c.json({ data }, HTTP_STATUS.CREATED);
});

app.patch('/accounts/:id', async (c) => {
  const user = getAuthUser(c);
  const id = parseId(c.req.param('id'));
  if (id === null) return c.json({ error: 'Invalid account id' }, HTTP_STATUS.BAD_REQUEST);

  const rawBody = await readJsonBody(c.req, 'Invalid savings account payload');
  if (!rawBody.ok) return c.json({ error: rawBody.error }, HTTP_STATUS.BAD_REQUEST);

  const body = parseSavingsAccountPatch(rawBody.value);
  if (!body.ok) return c.json({ error: body.error }, HTTP_STATUS.BAD_REQUEST);
  if (Object.keys(body.value).length === 0) {
    return c.json({ error: 'No savings account fields provided' }, HTTP_STATUS.BAD_REQUEST);
  }

  const [data] = await db
    .update(savingsAccounts)
    .set(toSavingsAccountUpdateValues(body.value))
    .where(and(eq(savingsAccounts.id, id), eq(savingsAccounts.userId, user.id)))
    .returning();
  if (!data) return c.json({ error: 'Account not found' }, HTTP_STATUS.NOT_FOUND);
  return c.json({ data });
});

app.delete('/accounts/:id', async (c) => {
  const user = getAuthUser(c);
  const id = parseId(c.req.param('id'));
  if (id === null) return c.json({ error: 'Invalid account id' }, HTTP_STATUS.BAD_REQUEST);

  const [data] = await db
    .delete(savingsAccounts)
    .where(and(eq(savingsAccounts.id, id), eq(savingsAccounts.userId, user.id)))
    .returning();
  if (!data) return c.json({ error: 'Account not found' }, HTTP_STATUS.NOT_FOUND);
  return c.json({ data });
});

// ── Transactions ─────────────────────────────────────────────────────────────

app.get('/transactions', async (c) => {
  const user = getAuthUser(c);
  const accountId = c.req.query('accountId');
  if (accountId) {
    const parsedAccountId = parseId(accountId);
    if (parsedAccountId === null) {
      return c.json({ error: 'Invalid account id' }, HTTP_STATUS.BAD_REQUEST);
    }
    const data = await db
      .select()
      .from(savingsTransactions)
      .where(
        and(
          eq(savingsTransactions.accountId, parsedAccountId),
          eq(savingsTransactions.userId, user.id),
        ),
      );
    return c.json({ data });
  }

  const data = await db
    .select()
    .from(savingsTransactions)
    .where(eq(savingsTransactions.userId, user.id));
  return c.json({ data });
});

app.get('/transactions/:id', async (c) => {
  const user = getAuthUser(c);
  const id = parseId(c.req.param('id'));
  if (id === null) return c.json({ error: 'Invalid transaction id' }, HTTP_STATUS.BAD_REQUEST);

  const data = await getOwnedSavingsTransaction(id, user.id);
  if (!data) return c.json({ error: 'Transaction not found' }, HTTP_STATUS.NOT_FOUND);
  return c.json({ data });
});

app.post('/transactions', async (c) => {
  const user = getAuthUser(c);
  const rawBody = await readJsonBody(c.req, 'Invalid savings transaction payload');
  if (!rawBody.ok) return c.json({ error: rawBody.error }, HTTP_STATUS.BAD_REQUEST);

  const body = parseSavingsTransactionCreate(rawBody.value);
  if (!body.ok) return c.json({ error: body.error }, HTTP_STATUS.BAD_REQUEST);

  const account = await getOwnedSavingsAccount(body.value.accountId, user.id);
  if (!account) return c.json({ error: 'Account not found' }, HTTP_STATUS.NOT_FOUND);

  const [data] = await db
    .insert(savingsTransactions)
    .values(toSavingsTransactionInsertValues(body.value, user.id))
    .returning();

  await db
    .update(savingsAccounts)
    .set({
      balance: sql`CAST(${savingsAccounts.balance} AS numeric) + ${
        body.value.type === 'withdrawal'
          ? -Math.abs(body.value.amount)
          : Math.abs(body.value.amount)
      }`,
    })
    .where(and(eq(savingsAccounts.id, body.value.accountId), eq(savingsAccounts.userId, user.id)));

  return c.json({ data }, HTTP_STATUS.CREATED);
});

app.patch('/transactions/:id', async (c) => {
  const user = getAuthUser(c);
  const id = parseId(c.req.param('id'));
  if (id === null) return c.json({ error: 'Invalid transaction id' }, HTTP_STATUS.BAD_REQUEST);

  const rawBody = await readJsonBody(c.req, 'Invalid savings transaction payload');
  if (!rawBody.ok) return c.json({ error: rawBody.error }, HTTP_STATUS.BAD_REQUEST);

  const body = parseSavingsTransactionPatch(rawBody.value);
  if (!body.ok) return c.json({ error: body.error }, HTTP_STATUS.BAD_REQUEST);
  if (Object.keys(body.value).length === 0) {
    return c.json({ error: 'No savings transaction fields provided' }, HTTP_STATUS.BAD_REQUEST);
  }

  const existing = await getOwnedSavingsTransaction(id, user.id);
  if (!existing) return c.json({ error: 'Transaction not found' }, HTTP_STATUS.NOT_FOUND);

  const nextState = resolveNextSavingsTransactionState(body.value, existing);
  const accountValidationError = await validatePatchedSavingsTransactionAccount({
    userId: user.id,
    previousAccountId: existing.accountId,
    nextAccountId: nextState.accountId,
  });
  if (accountValidationError) {
    return c.json({ error: accountValidationError }, HTTP_STATUS.NOT_FOUND);
  }

  const [data] = await db
    .update(savingsTransactions)
    .set(toSavingsTransactionUpdateValues(body.value))
    .where(and(eq(savingsTransactions.id, id), eq(savingsTransactions.userId, user.id)))
    .returning();
  if (!data) return c.json({ error: 'Transaction not found' }, HTTP_STATUS.NOT_FOUND);

  await syncSavingsBalancesForEditedTransaction({
    userId: user.id,
    previousAccountId: existing.accountId,
    nextAccountId: nextState.accountId,
    previousType: existing.type,
    nextType: nextState.type,
    previousAmount: existing.amount,
    nextAmount: nextState.amount,
  });

  return c.json({ data });
});

app.delete('/transactions/:id', async (c) => {
  const user = getAuthUser(c);
  const id = parseId(c.req.param('id'));
  if (id === null) return c.json({ error: 'Invalid transaction id' }, HTTP_STATUS.BAD_REQUEST);

  const [data] = await db
    .delete(savingsTransactions)
    .where(and(eq(savingsTransactions.id, id), eq(savingsTransactions.userId, user.id)))
    .returning();
  if (!data) return c.json({ error: 'Transaction not found' }, HTTP_STATUS.NOT_FOUND);

  await db
    .update(savingsAccounts)
    .set({
      balance: sql`CAST(${savingsAccounts.balance} AS numeric) + ${
        data.type === 'withdrawal'
          ? Math.abs(toFiniteNumber(data.amount))
          : -Math.abs(toFiniteNumber(data.amount))
      }`,
    })
    .where(and(eq(savingsAccounts.id, data.accountId), eq(savingsAccounts.userId, user.id)));

  return c.json({ data });
});

export default app;
