import { and, eq, getTableColumns, isNull } from 'drizzle-orm';
import { Hono } from 'hono';
import {
  SAVINGS_ACCOUNT_TYPES,
  SAVINGS_TRANSACTION_TYPES,
  type SavingsAccountType,
  type SavingsTransactionType,
} from '@quro/shared';
import { HTTP_STATUS } from '../constants/http';
import { db } from '../db/client';
import { savingsAccounts, savingsTransactions } from '../db/schema';
import { getAuthUser } from '../lib/authUser';
import { assertJointAllowed, getAcceptedPartnerId, ownedOrJointPredicate } from '../lib/partner';
import {
  toFiniteNumber,
  toSignedSavingsAmount,
  updateSavingsAccountBalanceByDelta,
} from '../lib/savingsBalance';
import {
  err,
  ok,
  parseBooleanField,
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
  'isJoint',
] as const;
const SAVINGS_TRANSACTION_FIELDS = ['accountId', 'type', 'amount', 'date', 'note'] as const;

type SavingsAccountPayload = {
  name: string;
  bank: string;
  balance: number;
  currency: 'EUR' | 'GBP' | 'USD' | 'AUD' | 'NZD' | 'CAD' | 'CHF' | 'SGD';
  interestRate: number;
  accountType: SavingsAccountType;
  color: string;
  emoji: string;
  isJoint: boolean;
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
  isJoint: (value) =>
    value === undefined ? ok(false) : parseBooleanField(value, 'isJoint must be a boolean'),
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

function toSavingsAccountInsertValues(
  payload: SavingsAccountPayload,
  userId: number,
): SavingsAccountInsert {
  return {
    userId,
    name: payload.name,
    bank: payload.bank,
    balance: payload.balance,
    currency: payload.currency,
    interestRate: payload.interestRate,
    accountType: payload.accountType,
    color: payload.color,
    emoji: payload.emoji,
    isJoint: payload.isJoint,
  };
}

function toSavingsAccountUpdateValues(
  payload: Partial<SavingsAccountPayload>,
): Partial<SavingsAccountInsert> {
  return {
    name: payload.name,
    bank: payload.bank,
    balance: payload.balance,
    currency: payload.currency,
    interestRate: payload.interestRate,
    accountType: payload.accountType,
    color: payload.color,
    emoji: payload.emoji,
    isJoint: payload.isJoint,
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
    amount: payload.amount,
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
    amount: payload.amount,
    date: payload.date,
    note: payload.note,
  };
}

function getSavingsAccountPredicate(
  accountId: number,
  userId: number,
  partnerId: number | null,
  options: { includeArchived?: boolean } = {},
) {
  const basePredicate = and(
    eq(savingsAccounts.id, accountId),
    ownedOrJointPredicate(savingsAccounts, userId, partnerId),
  );
  return options.includeArchived
    ? basePredicate
    : and(basePredicate, isNull(savingsAccounts.archivedAt));
}

async function getAccessibleSavingsAccount(
  accountId: number,
  userId: number,
  partnerId: number | null,
  options: { includeArchived?: boolean } = {},
) {
  const [account] = await db
    .select()
    .from(savingsAccounts)
    .where(getSavingsAccountPredicate(accountId, userId, partnerId, options));
  return account ?? null;
}

async function getAccessibleSavingsTransaction(
  transactionId: number,
  userId: number,
  partnerId: number | null,
) {
  const [transaction] = await db
    .select(getTableColumns(savingsTransactions))
    .from(savingsTransactions)
    .innerJoin(savingsAccounts, eq(savingsTransactions.accountId, savingsAccounts.id))
    .where(
      and(
        eq(savingsTransactions.id, transactionId),
        ownedOrJointPredicate(savingsAccounts, userId, partnerId),
      ),
    );
  return transaction ?? null;
}

async function syncSavingsBalancesForEditedTransaction(params: {
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
      newSignedAmount - oldSignedAmount,
    );
    return;
  }

  await updateSavingsAccountBalanceByDelta(params.previousAccountId, -oldSignedAmount);
  await updateSavingsAccountBalanceByDelta(params.nextAccountId, newSignedAmount);
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

type EditableTransactionResult =
  | { ok: true; transaction: typeof savingsTransactions.$inferSelect }
  | { ok: false; error: string; status: 400 | 404 };

async function getEditableSavingsTransaction(
  transactionId: number,
  userId: number,
  partnerId: number | null,
  action: 'modify' | 'delete',
): Promise<EditableTransactionResult> {
  const transaction = await getAccessibleSavingsTransaction(transactionId, userId, partnerId);
  if (!transaction) {
    return { ok: false, error: 'Transaction not found', status: HTTP_STATUS.NOT_FOUND };
  }

  const account = await getAccessibleSavingsAccount(transaction.accountId, userId, partnerId, {
    includeArchived: true,
  });
  if (account?.bunqAccountId) {
    const verb = action === 'modify' ? 'modify transactions on' : 'delete transactions from';
    return {
      ok: false,
      error: `Cannot ${verb} a Bunq-synced account`,
      status: HTTP_STATUS.BAD_REQUEST,
    };
  }

  return { ok: true, transaction };
}

async function resolvePatchedSavingsTransactionAccount(params: {
  userId: number;
  partnerId: number | null;
  previousAccountId: number;
  nextAccountId: number;
}): Promise<{ ok: true; nextAccountUserId: number | null } | { ok: false; error: string }> {
  if (params.nextAccountId === params.previousAccountId) {
    return { ok: true, nextAccountUserId: null };
  }
  const account = await getAccessibleSavingsAccount(
    params.nextAccountId,
    params.userId,
    params.partnerId,
  );
  if (!account) return { ok: false, error: 'Account not found' };
  return { ok: true, nextAccountUserId: account.userId };
}

// ── Accounts ─────────────────────────────────────────────────────────────────

app.get('/accounts', async (c) => {
  const user = getAuthUser(c);
  const partnerId = await getAcceptedPartnerId(user.id);
  const includeArchived = c.req.query('includeArchived') === 'true';
  const accessPredicate = ownedOrJointPredicate(savingsAccounts, user.id, partnerId);
  const data = await db
    .select()
    .from(savingsAccounts)
    .where(
      includeArchived ? accessPredicate : and(accessPredicate, isNull(savingsAccounts.archivedAt)),
    );
  return c.json({ data });
});

app.get('/accounts/:id', async (c) => {
  const user = getAuthUser(c);
  const id = parseId(c.req.param('id'));
  if (id === null) return c.json({ error: 'Invalid account id' }, HTTP_STATUS.BAD_REQUEST);

  const partnerId = await getAcceptedPartnerId(user.id);
  const data = await getAccessibleSavingsAccount(id, user.id, partnerId);
  if (!data) return c.json({ error: 'Account not found' }, HTTP_STATUS.NOT_FOUND);
  return c.json({ data });
});

app.post('/accounts', async (c) => {
  const user = getAuthUser(c);
  const rawBody = await readJsonBody(c.req, 'Invalid savings account payload');
  if (!rawBody.ok) return c.json({ error: rawBody.error }, HTTP_STATUS.BAD_REQUEST);

  const body = parseSavingsAccountCreate(rawBody.value);
  if (!body.ok) return c.json({ error: body.error }, HTTP_STATUS.BAD_REQUEST);

  const jointError = await assertJointAllowed(user.id, body.value.isJoint);
  if (jointError) return c.json({ error: jointError }, HTTP_STATUS.BAD_REQUEST);

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

  const jointError = await assertJointAllowed(user.id, body.value.isJoint);
  if (jointError) return c.json({ error: jointError }, HTTP_STATUS.BAD_REQUEST);

  const partnerId = await getAcceptedPartnerId(user.id);
  const [data] = await db
    .update(savingsAccounts)
    .set(toSavingsAccountUpdateValues(body.value))
    .where(getSavingsAccountPredicate(id, user.id, partnerId))
    .returning();
  if (!data) return c.json({ error: 'Account not found' }, HTTP_STATUS.NOT_FOUND);
  return c.json({ data });
});

app.delete('/accounts/:id', async (c) => {
  const user = getAuthUser(c);
  const id = parseId(c.req.param('id'));
  if (id === null) return c.json({ error: 'Invalid account id' }, HTTP_STATUS.BAD_REQUEST);

  const partnerId = await getAcceptedPartnerId(user.id);
  if (c.req.query('cascade') === 'true') {
    const [data] = await db
      .delete(savingsAccounts)
      .where(getSavingsAccountPredicate(id, user.id, partnerId, { includeArchived: true }))
      .returning();
    if (!data) return c.json({ error: 'Account not found' }, HTTP_STATUS.NOT_FOUND);
    return c.json({ data });
  }

  const [data] = await db
    .update(savingsAccounts)
    .set({ archivedAt: new Date() })
    .where(getSavingsAccountPredicate(id, user.id, partnerId))
    .returning();
  if (!data) return c.json({ error: 'Account not found' }, HTTP_STATUS.NOT_FOUND);
  return c.json({ data });
});

app.post('/accounts/:id/unarchive', async (c) => {
  const user = getAuthUser(c);
  const id = parseId(c.req.param('id'));
  if (id === null) return c.json({ error: 'Invalid account id' }, HTTP_STATUS.BAD_REQUEST);

  const partnerId = await getAcceptedPartnerId(user.id);
  const [data] = await db
    .update(savingsAccounts)
    .set({ archivedAt: null })
    .where(getSavingsAccountPredicate(id, user.id, partnerId, { includeArchived: true }))
    .returning();
  if (!data) return c.json({ error: 'Account not found' }, HTTP_STATUS.NOT_FOUND);
  return c.json({ data });
});

// ── Transactions ─────────────────────────────────────────────────────────────

app.get('/transactions', async (c) => {
  const user = getAuthUser(c);
  const partnerId = await getAcceptedPartnerId(user.id);
  const accountId = c.req.query('accountId');
  if (accountId) {
    const parsedAccountId = parseId(accountId);
    if (parsedAccountId === null) {
      return c.json({ error: 'Invalid account id' }, HTTP_STATUS.BAD_REQUEST);
    }
    const account = await getAccessibleSavingsAccount(parsedAccountId, user.id, partnerId, {
      includeArchived: true,
    });
    if (!account) return c.json({ error: 'Account not found' }, HTTP_STATUS.NOT_FOUND);
    const data = await db
      .select()
      .from(savingsTransactions)
      .where(eq(savingsTransactions.accountId, parsedAccountId));
    return c.json({ data });
  }

  const data = await db
    .select(getTableColumns(savingsTransactions))
    .from(savingsTransactions)
    .innerJoin(savingsAccounts, eq(savingsTransactions.accountId, savingsAccounts.id))
    .where(ownedOrJointPredicate(savingsAccounts, user.id, partnerId));
  return c.json({ data });
});

app.get('/transactions/:id', async (c) => {
  const user = getAuthUser(c);
  const id = parseId(c.req.param('id'));
  if (id === null) return c.json({ error: 'Invalid transaction id' }, HTTP_STATUS.BAD_REQUEST);

  const partnerId = await getAcceptedPartnerId(user.id);
  const data = await getAccessibleSavingsTransaction(id, user.id, partnerId);
  if (!data) return c.json({ error: 'Transaction not found' }, HTTP_STATUS.NOT_FOUND);
  return c.json({ data });
});

app.post('/transactions', async (c) => {
  const user = getAuthUser(c);
  const rawBody = await readJsonBody(c.req, 'Invalid savings transaction payload');
  if (!rawBody.ok) return c.json({ error: rawBody.error }, HTTP_STATUS.BAD_REQUEST);

  const body = parseSavingsTransactionCreate(rawBody.value);
  if (!body.ok) return c.json({ error: body.error }, HTTP_STATUS.BAD_REQUEST);

  const partnerId = await getAcceptedPartnerId(user.id);
  const account = await getAccessibleSavingsAccount(body.value.accountId, user.id, partnerId);
  if (!account) return c.json({ error: 'Account not found' }, HTTP_STATUS.NOT_FOUND);
  if (account.bunqAccountId) {
    return c.json(
      { error: 'Cannot add manual transactions to a Bunq-synced account' },
      HTTP_STATUS.BAD_REQUEST,
    );
  }

  const [data] = await db
    .insert(savingsTransactions)
    .values(toSavingsTransactionInsertValues(body.value, account.userId ?? user.id))
    .returning();

  await updateSavingsAccountBalanceByDelta(
    body.value.accountId,
    toSignedSavingsAmount(body.value.type, body.value.amount),
  );

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

  const partnerId = await getAcceptedPartnerId(user.id);
  const editable = await getEditableSavingsTransaction(id, user.id, partnerId, 'modify');
  if (!editable.ok) return c.json({ error: editable.error }, editable.status);
  const existing = editable.transaction;

  const nextState = resolveNextSavingsTransactionState(body.value, existing);
  const nextAccount = await resolvePatchedSavingsTransactionAccount({
    userId: user.id,
    partnerId,
    previousAccountId: existing.accountId,
    nextAccountId: nextState.accountId,
  });
  if (!nextAccount.ok) {
    return c.json({ error: nextAccount.error }, HTTP_STATUS.NOT_FOUND);
  }

  const updateValues = toSavingsTransactionUpdateValues(body.value);
  // Keep the row's userId aligned with its (possibly new) parent account owner.
  if (nextAccount.nextAccountUserId !== null) {
    updateValues.userId = nextAccount.nextAccountUserId;
  }

  const [data] = await db
    .update(savingsTransactions)
    .set(updateValues)
    .where(eq(savingsTransactions.id, id))
    .returning();
  if (!data) return c.json({ error: 'Transaction not found' }, HTTP_STATUS.NOT_FOUND);

  await syncSavingsBalancesForEditedTransaction({
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

  const partnerId = await getAcceptedPartnerId(user.id);
  const editable = await getEditableSavingsTransaction(id, user.id, partnerId, 'delete');
  if (!editable.ok) return c.json({ error: editable.error }, editable.status);

  const [data] = await db
    .delete(savingsTransactions)
    .where(eq(savingsTransactions.id, id))
    .returning();
  if (!data) return c.json({ error: 'Transaction not found' }, HTTP_STATUS.NOT_FOUND);

  await updateSavingsAccountBalanceByDelta(
    data.accountId,
    -toSignedSavingsAmount(data.type, data.amount),
  );

  return c.json({ data });
});

export default app;
