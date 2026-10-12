import { resolvePropertyDebts } from '../lib/propertyDebt';
import { registerTransactionReadRoutes } from '../lib/transactionRoutes';
import { registerArchivableResource } from '../lib/archivableResource';
import { findAccessible, findAccessibleChild } from '../lib/access';
import { Hono } from 'hono';
import {
  PROPERTY_TRANSACTION_TYPES,
  type CurrencyCode,
  type PropertyTransactionType,
  roundMoney,
  validateRepaymentSplit,
  type PropertyTransactionPayload,
} from '@quro/shared';
import { db, type DbExecutor, type DbTransaction } from '../db/client';
import { mortgages, properties, propertyTransactions } from '../db/schema';
import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import { getAuthUser, getPartnerId } from '../lib/authUser';
import {
  type AppliedRepayment,
  applyRepayment,
  MORTGAGE_BALANCE,
  PROPERTY_MORTGAGE_BALANCE,
  reverseRepayment,
} from '../lib/balance';
import { HTTP_STATUS } from '../constants/http';
import { earliestDate } from '../lib/netWorth';
import {
  answerRejectedEdit,
  LedgerEditRejected,
  LEDGER_ROW_CHANGED,
  type LedgerRejection,
  lockCheckedLedgerRow,
  lockLedgerParents,
  withLedgerWrite,
} from '../lib/ledgerWrite';
import { assertJointAllowed, ownedOrJointPredicate } from '../lib/partner';
import {
  err,
  type FieldParsers,
  isRecord,
  ok,
  parseBooleanField,
  parseCurrencyField,
  parseDateField,
  parseId,
  parseIntegerField,
  parseMoneyField,
  parseNormalizedDecimal,
  parseOptionalId,
  parseOptionalMoneyField,
  parseOptionalTextField,
  parsePatchFields,
  parseRequiredFields,
  type ParseResult,
  parseTextField,
  pickPatchedValue,
  readJsonBody,
  rejectUnknownFields,
} from '../lib/requestValidation';

const app = new Hono();

const REPAYMENT_EXCEEDS_BALANCE = 'Principal portion cannot exceed the current outstanding balance';

const PROPERTY_FIELDS = [
  'address',
  'propertyType',
  'purchasePrice',
  'currentValue',
  'mortgage',
  'mortgageId',
  'monthlyRent',
  'currency',
  'emoji',
  'isJoint',
] as const;

const PROPERTY_TRANSACTION_FIELDS = [
  'propertyId',
  'type',
  'amount',
  'interest',
  'principal',
  'date',
  'note',
] as const;

const INVESTMENT_PROPERTY_TYPE_KEYS = new Set([
  'buy-to-let',
  'investment',
  'holiday home',
  'commercial',
  'rental',
]);

type PropertyPayload = {
  address: string;
  propertyType: string;
  purchasePrice: number;
  currentValue: number;
  mortgage: number;
  mortgageId: number | null;
  monthlyRent: number;
  currency: CurrencyCode;
  emoji: string | null;
  isJoint: boolean;
};

type PropertyCreateRequiredPayload = Omit<
  PropertyPayload,
  'mortgage' | 'mortgageId' | 'emoji' | 'isJoint'
>;

function parsePropertyTransactionTypeField(value: unknown): ParseResult<PropertyTransactionType> {
  return typeof value === 'string' &&
    PROPERTY_TRANSACTION_TYPES.includes(value as PropertyTransactionType)
    ? ok(value as PropertyTransactionType)
    : err('Invalid property transaction type');
}

const propertyParsers: FieldParsers<PropertyPayload> = {
  address: (value) => parseTextField(value, 'Property address is required'),
  propertyType: (value) => parseTextField(value, 'Property type is required'),
  purchasePrice: (value) =>
    parseMoneyField(value, {
      field: 'purchasePrice',
      error: 'Purchase price must be greater than zero',
      min: Number.MIN_VALUE,
      localized: true,
    }),
  currentValue: (value) =>
    parseMoneyField(value, {
      field: 'currentValue',
      error: 'Current value must be greater than zero',
      min: Number.MIN_VALUE,
      localized: true,
    }),
  mortgage: (value) =>
    parseMoneyField(value, {
      field: 'mortgage',
      error: 'Mortgage balance must be zero or greater',
      min: 0,
      localized: true,
    }),
  mortgageId: (value) => {
    const parsed = parseOptionalId(value);
    return parsed === 'invalid' ? err('Invalid mortgage id') : ok(parsed);
  },
  monthlyRent: (value) =>
    parseMoneyField(value, {
      field: 'monthlyRent',
      error: 'Monthly rent must be zero or greater',
      min: 0,
      localized: true,
    }),
  currency: parseCurrencyField,
  emoji: (value) => parseOptionalTextField(value, 'Emoji must be a string'),
  isJoint: (value) =>
    value === undefined ? ok(false) : parseBooleanField(value, 'isJoint must be a boolean'),
};

const propertyCreateRequiredParsers: FieldParsers<PropertyCreateRequiredPayload> = {
  address: propertyParsers.address,
  propertyType: propertyParsers.propertyType,
  purchasePrice: propertyParsers.purchasePrice,
  currentValue: propertyParsers.currentValue,
  monthlyRent: propertyParsers.monthlyRent,
  currency: propertyParsers.currency,
};

const propertyTransactionParsers: FieldParsers<PropertyTransactionPayload> = {
  propertyId: (value) => parseIntegerField(value, 'Invalid property id', 1),
  type: parsePropertyTransactionTypeField,
  amount: (value) =>
    parseMoneyField(value, {
      field: 'amount',
      error: 'Amount must be greater than zero',
      min: Number.MIN_VALUE,
      localized: true,
    }),
  interest: (value) =>
    parseOptionalMoneyField(value, {
      field: 'interest',
      error: 'Interest must be zero or greater',
      min: 0,
      localized: true,
    }),
  principal: (value) =>
    parseOptionalMoneyField(value, {
      field: 'principal',
      error: 'Principal must be zero or greater',
      min: 0,
      localized: true,
    }),
  date: (value) => parseDateField(value, 'Transaction date must be a valid ISO date'),
  note: (value) => parseOptionalTextField(value, 'Transaction note must be a string'),
};

function parsePropertyCreate(body: unknown): ParseResult<PropertyPayload> {
  if (!isRecord(body)) return err('Invalid property payload');
  const strictCheck = rejectUnknownFields(body, PROPERTY_FIELDS);
  if (!strictCheck.ok) return strictCheck;
  const required = parseRequiredFields(body, propertyCreateRequiredParsers);
  if (!required.ok) return required;
  const mortgage = propertyParsers.mortgage(body.mortgage ?? 0);
  if (!mortgage.ok) return mortgage;
  const mortgageId = propertyParsers.mortgageId(body.mortgageId);
  if (!mortgageId.ok) return mortgageId;
  const emoji = propertyParsers.emoji(body.emoji);
  if (!emoji.ok) return emoji;
  const isJoint = propertyParsers.isJoint(body.isJoint);
  if (!isJoint.ok) return isJoint;

  return ok({
    ...required.value,
    mortgage: mortgage.value,
    mortgageId: mortgageId.value,
    emoji: emoji.value,
    isJoint: isJoint.value,
  });
}

function parsePropertyPatch(body: unknown): ParseResult<Partial<PropertyPayload>> {
  if (!isRecord(body)) return err('Invalid property payload');
  const strictCheck = rejectUnknownFields(body, PROPERTY_FIELDS);
  if (!strictCheck.ok) return strictCheck;
  return parsePatchFields(body, propertyParsers);
}

function parsePropertyTransactionCreate(body: unknown): ParseResult<PropertyTransactionPayload> {
  if (!isRecord(body)) return err('Invalid property transaction payload');
  const strictCheck = rejectUnknownFields(body, PROPERTY_TRANSACTION_FIELDS);
  if (!strictCheck.ok) return strictCheck;

  const parsed = parseRequiredFields(body, propertyTransactionParsers);
  if (!parsed.ok) return parsed;
  return ok(normalizePropertyTransactionPayload(parsed.value));
}

function parsePropertyTransactionPatch(
  body: unknown,
): ParseResult<Partial<PropertyTransactionPayload>> {
  if (!isRecord(body)) return err('Invalid property transaction payload');
  const strictCheck = rejectUnknownFields(body, PROPERTY_TRANSACTION_FIELDS);
  if (!strictCheck.ok) return strictCheck;
  return parsePatchFields(body, propertyTransactionParsers);
}

function normalizePropertyTransactionPayload(
  payload: PropertyTransactionPayload,
): PropertyTransactionPayload {
  if (payload.type === 'repayment') {
    const interest = payload.interest ?? 0;
    const principal = payload.principal ?? roundMoney(payload.amount - interest);
    return { ...payload, interest, principal };
  }

  return {
    ...payload,
    interest: null,
    principal: null,
  };
}

function validatePropertyRepaymentPayload(
  payload: PropertyTransactionPayload,
  property: typeof properties.$inferSelect,
  keepsRecordedDebt: boolean,
): string | null {
  if (
    !keepsRecordedDebt &&
    (parseNormalizedDecimal(property.mortgage) ?? 0) <= 0 &&
    property.mortgageId == null
  ) {
    return 'Property is not linked to a mortgage';
  }

  return validateRepaymentSplit({
    amount: payload.amount,
    interest: payload.interest ?? 0,
    principal: payload.principal ?? 0,
  });
}

function isRentOrExpenseTransaction(type: PropertyTransactionType): boolean {
  return type === 'rent_income' || type === 'expense';
}

function validatePropertyTransactionPayload(
  payload: PropertyTransactionPayload,
  property: typeof properties.$inferSelect,
  keepsRecordedDebt = false,
): string | null {
  if (payload.type === 'repayment') {
    return validatePropertyRepaymentPayload(payload, property, keepsRecordedDebt);
  }
  if (
    isRentOrExpenseTransaction(payload.type) &&
    !isInvestmentPropertyType(property.propertyType)
  ) {
    return 'Rent and expense transactions are only supported for investment properties';
  }

  return null;
}

function mergePropertyTransactionPayload(
  patch: Partial<PropertyTransactionPayload>,
  existing: typeof propertyTransactions.$inferSelect,
): ParseResult<PropertyTransactionPayload> {
  return parsePropertyTransactionCreate({
    propertyId: patch.propertyId ?? existing.propertyId,
    type: patch.type ?? existing.type,
    amount: patch.amount ?? existing.amount,
    interest: patch.interest === undefined ? existing.interest : patch.interest,
    principal: patch.principal === undefined ? existing.principal : patch.principal,
    date: patch.date ?? existing.date,
    note: patch.note === undefined ? existing.note : patch.note,
  });
}

function isInvestmentPropertyType(value: string): boolean {
  return INVESTMENT_PROPERTY_TYPE_KEYS.has(value.trim().toLowerCase());
}

function toPropertyInsertValues(
  payload: PropertyPayload,
  userId: number,
): typeof properties.$inferInsert {
  return {
    userId,
    address: payload.address,
    propertyType: payload.propertyType,
    purchasePrice: payload.purchasePrice,
    currentValue: payload.currentValue,
    mortgage: payload.mortgage,
    mortgageId: payload.mortgageId,
    monthlyRent: payload.monthlyRent,
    currency: payload.currency,
    emoji: payload.emoji,
    isJoint: payload.isJoint,
  };
}

function toPropertyUpdateValues(
  payload: Partial<PropertyPayload>,
): Partial<typeof properties.$inferInsert> {
  return {
    address: payload.address,
    propertyType: payload.propertyType,
    purchasePrice: payload.purchasePrice,
    currentValue: payload.currentValue,
    mortgage: payload.mortgage,
    mortgageId: payload.mortgageId,
    monthlyRent: payload.monthlyRent,
    currency: payload.currency,
    emoji: payload.emoji,
    isJoint: payload.isJoint,
  };
}

function toPropertyTransactionInsertValues(
  payload: PropertyTransactionPayload,
  userId: number,
): typeof propertyTransactions.$inferInsert {
  return {
    userId,
    propertyId: payload.propertyId,
    type: payload.type,
    amount: payload.amount,
    interest: payload.interest ?? null,
    principal: payload.principal ?? null,
    date: payload.date,
    note: payload.note,
  };
}

function toPropertyTransactionUpdateValues(
  payload: PropertyTransactionPayload,
): Partial<typeof propertyTransactions.$inferInsert> {
  return {
    propertyId: payload.propertyId,
    type: payload.type,
    amount: payload.amount,
    interest: payload.interest ?? null,
    principal: payload.principal ?? null,
    date: payload.date,
    note: payload.note,
  };
}

function getAccessibleProperty(
  userId: number,
  partnerId: number | null,
  propertyId: number,
  executor: DbExecutor = db,
) {
  return findAccessible(properties, propertyId, { userId, partnerId }, { executor });
}

// The debt a property repayment reduces: a mortgage (null once that mortgage is deleted) or the
// property's own debt. It is stored with the repayment, so an edit or delete reverses the effect
// on the same debt even after the property is linked to a mortgage, relinked or unlinked.
// `locked` marks a recorded mortgage the user can no longer access (a former partner's): the
// repayment keeps pointing at it, but its balance is not changed from this household.
type RepaymentDebt =
  | { target: 'property'; propertyId: number }
  | { target: 'mortgage'; mortgageId: number | null; locked?: boolean };

type PropertyTransactionRow = typeof propertyTransactions.$inferSelect;

// A new repayment reduces the linked mortgage (the source of truth) or, for a property with no
// linked mortgage, the property's own debt.
function currentRepaymentDebt(property: { id: number; mortgageId: number | null }): RepaymentDebt {
  return property.mortgageId == null
    ? { target: 'property', propertyId: property.id }
    : { target: 'mortgage', mortgageId: property.mortgageId };
}

// The debt a stored repayment reduced, or null for other types and for repayments recorded
// before the debt was stored.
function recordedRepaymentDebt(row: PropertyTransactionRow): RepaymentDebt | null {
  if (row.type !== 'repayment') return null;
  if (row.repaymentTarget === 'property') return { target: 'property', propertyId: row.propertyId };
  if (row.repaymentTarget === 'mortgage') {
    return { target: 'mortgage', mortgageId: row.repaymentMortgageId };
  }
  return null;
}

function repaymentDebtColumns(debt: RepaymentDebt | null, unappliedPrincipal: number) {
  return {
    repaymentTarget: debt?.target ?? null,
    repaymentMortgageId: debt?.target === 'mortgage' ? debt.mortgageId : null,
    unappliedPrincipal,
  };
}

function applyRepaymentToDebt(
  tx: DbTransaction,
  debt: RepaymentDebt,
  principal: number,
): Promise<AppliedRepayment | null> {
  if (debt.target === 'property') {
    return applyRepayment(tx, PROPERTY_MORTGAGE_BALANCE, { id: debt.propertyId, principal });
  }
  // The mortgage was deleted or is out of reach: nothing is applied, so the whole principal is
  // recorded as unapplied and a later reversal restores nothing.
  if (debt.mortgageId == null || debt.locked) {
    return Promise.resolve({ balance: 0, unapplied: principal });
  }
  return applyRepayment(tx, MORTGAGE_BALANCE, { id: debt.mortgageId, principal });
}

async function reverseRepaymentOnDebt(
  tx: DbTransaction,
  debt: RepaymentDebt,
  row: Pick<PropertyTransactionRow, 'principal' | 'unappliedPrincipal'>,
): Promise<void> {
  const change = { principal: row.principal ?? 0, unapplied: row.unappliedPrincipal };
  if (debt.target === 'property') {
    await reverseRepayment(tx, PROPERTY_MORTGAGE_BALANCE, { id: debt.propertyId, ...change });
  } else if (debt.mortgageId != null && !debt.locked) {
    await reverseRepayment(tx, MORTGAGE_BALANCE, { id: debt.mortgageId, ...change });
  }
}

// The debt a committed repayment reduced: the stored one, or for an older row the property's
// current link (how those rows were always reversed). Null for other types.
async function resolveRepaymentDebt(
  tx: DbTransaction,
  userId: number,
  partnerId: number | null,
  transaction: PropertyTransactionRow,
): Promise<RepaymentDebt | null> {
  if (transaction.type !== 'repayment') return null;
  const recorded = recordedRepaymentDebt(transaction);
  if (recorded?.target === 'mortgage' && recorded.mortgageId != null) {
    const reachable = await findAccessible(
      mortgages,
      recorded.mortgageId,
      { userId, partnerId },
      { executor: tx },
    );
    return reachable ? recorded : { ...recorded, locked: true };
  }
  if (recorded) return recorded;
  const property = await getAccessibleProperty(userId, partnerId, transaction.propertyId, tx);
  return property ? currentRepaymentDebt(property) : null;
}

// Locks what an edit or delete of a property transaction may change, in the order every writer
// uses: mortgages, then properties, then the transaction row. A cascade archive of a mortgage
// locks it before unlinking its property, so this order cannot deadlock with it. Answers 409
// when a link moved between the unlocked read and the lock.
async function lockPropertyLedger(
  tx: DbTransaction,
  existing: PropertyTransactionRow,
  nextPropertyId: number,
): Promise<PropertyTransactionRow> {
  const propertyIds = [existing.propertyId, nextPropertyId];
  const links = await tx
    .select({ mortgageId: properties.mortgageId })
    .from(properties)
    .where(inArray(properties.id, propertyIds));
  const mortgageIds = new Set(
    [existing.repaymentMortgageId, ...links.map((link) => link.mortgageId)].filter(
      (id): id is number => id != null,
    ),
  );
  await lockLedgerParents(tx, mortgages, [...mortgageIds]);
  const locked = await lockLedgerParents(tx, properties, propertyIds);
  if (
    locked.some((property) => property.mortgageId != null && !mortgageIds.has(property.mortgageId))
  ) {
    throw new LedgerEditRejected<LedgerRejection>({
      error: LEDGER_ROW_CHANGED,
      status: HTTP_STATUS.CONFLICT,
    });
  }
  return lockCheckedLedgerRow(
    tx,
    propertyTransactions,
    existing.id,
    (row) =>
      row.propertyId === existing.propertyId &&
      (row.repaymentMortgageId == null || mortgageIds.has(row.repaymentMortgageId)),
  );
}

function getAccessiblePropertyTransaction(
  userId: number,
  partnerId: number | null,
  transactionId: number,
) {
  return findAccessibleChild(
    { table: propertyTransactions, parent: properties, parentId: propertyTransactions.propertyId },
    transactionId,
    { userId, partnerId },
  );
}

async function readPropertyPatchPayload(
  request: Pick<Request, 'json'>,
): Promise<
  { ok: true; value: Partial<PropertyPayload> } | { ok: false; error: string; status: 400 }
> {
  const rawBody = await readJsonBody(request, 'Invalid property payload');
  if (!rawBody.ok) {
    return { ok: false, error: rawBody.error, status: HTTP_STATUS.BAD_REQUEST };
  }

  const body = parsePropertyPatch(rawBody.value);
  if (!body.ok) {
    return { ok: false, error: body.error, status: HTTP_STATUS.BAD_REQUEST };
  }
  if (Object.keys(body.value).length === 0) {
    return {
      ok: false,
      error: 'No property fields provided',
      status: HTTP_STATUS.BAD_REQUEST,
    };
  }

  return body;
}

function getAccessibleMortgageForPropertyLink(
  userId: number,
  partnerId: number | null,
  mortgageId: number,
) {
  return findAccessible(mortgages, mortgageId, { userId, partnerId });
}

// The mortgage id has already been access-checked, so the linked-property
// search is by mortgageId alone (the property may belong to the partner).
async function getPropertyLinkedToMortgage(params: {
  mortgageId: number;
  excludePropertyId?: number;
}) {
  const linked = await db
    .select({ id: properties.id })
    .from(properties)
    .where(eq(properties.mortgageId, params.mortgageId));

  return linked.find((property) => property.id !== params.excludePropertyId) ?? null;
}

// Mortgage id comes from an access-checked property row, so the update is by
// id only. Jointness propagates to keep the linked pair consistent for the
// 50% dashboard weighting.
async function syncLinkedMortgageMetadata(params: {
  mortgageId: number | null;
  property: typeof properties.$inferSelect;
  executor?: DbExecutor;
}): Promise<void> {
  if (params.mortgageId == null) return;

  await (params.executor ?? db)
    .update(mortgages)
    .set({
      propertyAddress: params.property.address,
      currency: params.property.currency,
      propertyValue: params.property.currentValue,
      isJoint: params.property.isJoint,
    })
    .where(eq(mortgages.id, params.mortgageId));
}

async function resolvePropertyMortgagePatch(params: {
  userId: number;
  partnerId: number | null;
  propertyId: number;
  existing: typeof properties.$inferSelect;
  patch: Partial<PropertyPayload>;
}): Promise<
  | { ok: true; value: { mortgageId: number | null; mortgage: number; isJoint?: boolean } }
  | { ok: false; error: string; status: 404 | 409 }
> {
  const nextMortgageId = pickPatchedValue(params.patch.mortgageId, params.existing.mortgageId);
  const requestedMortgageBalance = pickPatchedValue(
    params.patch.mortgage,
    parseNormalizedDecimal(params.existing.mortgage) ?? 0,
  );

  if (nextMortgageId === null) {
    return {
      ok: true,
      value: {
        mortgageId: null,
        mortgage: params.patch.mortgageId === undefined ? requestedMortgageBalance : 0,
      },
    };
  }

  const mortgage = await getAccessibleMortgageForPropertyLink(
    params.userId,
    params.partnerId,
    nextMortgageId,
  );
  if (!mortgage) return { ok: false, error: 'Mortgage not found', status: HTTP_STATUS.NOT_FOUND };

  const linkedProperty = await getPropertyLinkedToMortgage({
    mortgageId: nextMortgageId,
    excludePropertyId: params.propertyId,
  });
  if (linkedProperty) {
    return {
      ok: false,
      error: 'Mortgage already linked to another property',
      status: HTTP_STATUS.CONFLICT,
    };
  }

  return {
    ok: true,
    value: {
      mortgageId: nextMortgageId,
      mortgage: 0,
      isJoint: params.patch.isJoint ?? (params.existing.isJoint || mortgage.isJoint),
    },
  };
}

// ── Properties ───────────────────────────────────────────────────────────────

app.get('/properties', async (c) => {
  const user = getAuthUser(c);
  const partnerId = getPartnerId(c);
  const includeArchived = c.req.query('includeArchived') === 'true';
  const accessPredicate = ownedOrJointPredicate(properties, user.id, partnerId);
  const data = await db
    .select()
    .from(properties)
    .where(includeArchived ? accessPredicate : and(accessPredicate, isNull(properties.archivedAt)))
    .orderBy(asc(properties.id));
  return c.json({ data: await resolvePropertyDebts(data) });
});

app.get('/properties/:id', async (c) => {
  const user = getAuthUser(c);
  const id = parseId(c.req.param('id'));
  if (id === null) return c.json({ error: 'Invalid property id' }, HTTP_STATUS.BAD_REQUEST);
  const partnerId = getPartnerId(c);
  const data = await getAccessibleProperty(user.id, partnerId, id);
  if (!data) return c.json({ error: 'Property not found' }, HTTP_STATUS.NOT_FOUND);
  return c.json({ data: (await resolvePropertyDebts([data]))[0] });
});

app.post('/properties', async (c) => {
  const user = getAuthUser(c);
  const rawBody = await readJsonBody(c.req, 'Invalid property payload');
  if (!rawBody.ok) return c.json({ error: rawBody.error }, HTTP_STATUS.BAD_REQUEST);

  const body = parsePropertyCreate(rawBody.value);
  if (!body.ok) return c.json({ error: body.error }, HTTP_STATUS.BAD_REQUEST);

  const partnerId = getPartnerId(c);
  let mortgageBalance = body.value.mortgage;
  let isJoint = body.value.isJoint;
  if (body.value.mortgageId !== null) {
    const mortgage = await getAccessibleMortgageForPropertyLink(
      user.id,
      partnerId,
      body.value.mortgageId,
    );
    if (!mortgage) return c.json({ error: 'Mortgage not found' }, HTTP_STATUS.NOT_FOUND);

    const linkedProperty = await getPropertyLinkedToMortgage({
      mortgageId: body.value.mortgageId,
    });
    if (linkedProperty) {
      return c.json({ error: 'Mortgage already linked to another property' }, HTTP_STATUS.CONFLICT);
    }

    mortgageBalance = 0;
    // A property linked to a joint mortgage is joint too (and vice versa).
    isJoint = isJoint || mortgage.isJoint;
  }

  const jointError = assertJointAllowed(getPartnerId(c), isJoint);
  if (jointError) return c.json({ error: jointError }, HTTP_STATUS.BAD_REQUEST);

  const propertyPayload = {
    ...body.value,
    mortgage: mortgageBalance,
    isJoint,
  };

  const data = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(properties)
      .values(toPropertyInsertValues(propertyPayload, user.id))
      .returning();

    await syncLinkedMortgageMetadata({
      mortgageId: created.mortgageId,
      property: created,
      executor: tx,
    });
    return created;
  });
  return c.json({ data: (await resolvePropertyDebts([data]))[0] }, HTTP_STATUS.CREATED);
});

app.patch('/properties/:id', async (c) => {
  const user = getAuthUser(c);
  const id = parseId(c.req.param('id'));
  if (id === null) return c.json({ error: 'Invalid property id' }, HTTP_STATUS.BAD_REQUEST);

  const partnerId = getPartnerId(c);
  const existing = await getAccessibleProperty(user.id, partnerId, id);
  if (!existing) return c.json({ error: 'Property not found' }, HTTP_STATUS.NOT_FOUND);

  const body = await readPropertyPatchPayload(c.req);
  if (!body.ok) return c.json({ error: body.error }, body.status);

  const jointError = assertJointAllowed(getPartnerId(c), body.value.isJoint);
  if (jointError) return c.json({ error: jointError }, HTTP_STATUS.BAD_REQUEST);

  const mortgagePatch = await resolvePropertyMortgagePatch({
    userId: user.id,
    partnerId,
    propertyId: id,
    existing,
    patch: body.value,
  });
  if (!mortgagePatch.ok) return c.json({ error: mortgagePatch.error }, mortgagePatch.status);

  const updates: Partial<PropertyPayload> = {
    ...body.value,
    ...mortgagePatch.value,
  };

  const data = await db.transaction(async (tx) => {
    // The linked mortgages first, then the property: the order a mortgage's cascade archive and
    // a repayment edit use.
    await lockLedgerParents(tx, mortgages, [existing.mortgageId, updates.mortgageId]);
    const [updated] = await tx
      .update(properties)
      .set(toPropertyUpdateValues(updates))
      .where(eq(properties.id, id))
      .returning();

    await syncLinkedMortgageMetadata({
      mortgageId: updated.mortgageId,
      property: updated,
      executor: tx,
    });
    return updated;
  });
  return c.json({ data: (await resolvePropertyDebts([data]))[0] });
});

async function hasActiveLinkedMortgage(
  mortgageId: number | null,
  executor: DbExecutor,
): Promise<boolean> {
  if (mortgageId == null) return false;
  const [mortgage] = await executor
    .select({ archivedAt: mortgages.archivedAt })
    .from(mortgages)
    .where(eq(mortgages.id, mortgageId));
  return mortgage != null && mortgage.archivedAt == null;
}

registerArchivableResource(app, {
  path: '/properties',
  table: properties,
  serialize: async (property) => (await resolvePropertyDebts([property]))[0],
  label: 'Property',
  idLabel: 'property',
  beforeDelete: async (tx, property) => {
    if (await hasActiveLinkedMortgage(property.mortgageId, tx)) {
      return {
        error: 'Remove or unlink the linked mortgage before deleting this property',
        status: HTTP_STATUS.CONFLICT,
      };
    }
    return null;
  },
});

// ── Property Transactions ────────────────────────────────────────────────────

registerTransactionReadRoutes(app, {
  path: '/property-transactions',
  table: propertyTransactions,
  parent: properties,
  parentId: propertyTransactions.propertyId,
  parentQuery: 'propertyId',
  parentLabel: 'Property',
  parentIdLabel: 'property',
  checkParent: true,
  emptyParentIsAbsent: true,
  scopeByChildOwner: false,
});

app.post('/property-transactions', async (c) => {
  const user = getAuthUser(c);
  const rawBody = await readJsonBody(c.req, 'Invalid property transaction payload');
  if (!rawBody.ok) return c.json({ error: rawBody.error }, HTTP_STATUS.BAD_REQUEST);

  const body = parsePropertyTransactionCreate(rawBody.value);
  if (!body.ok) return c.json({ error: body.error }, HTTP_STATUS.BAD_REQUEST);

  const partnerId = getPartnerId(c);
  const result = await db.transaction(async (tx) => {
    const property = await getAccessibleProperty(user.id, partnerId, body.value.propertyId, tx);
    if (!property) return { error: 'Property not found', status: HTTP_STATUS.NOT_FOUND } as const;

    const validationError = validatePropertyTransactionPayload(body.value, property);
    if (validationError)
      return { error: validationError, status: HTTP_STATUS.BAD_REQUEST } as const;

    let debtColumns = repaymentDebtColumns(null, 0);
    if (body.value.type === 'repayment') {
      const debt = currentRepaymentDebt(property);
      const applied = await applyRepaymentToDebt(tx, debt, body.value.principal ?? 0);
      if (!applied) {
        return { error: REPAYMENT_EXCEEDS_BALANCE, status: HTTP_STATUS.BAD_REQUEST } as const;
      }
      debtColumns = repaymentDebtColumns(debt, applied.unapplied);
    }

    const [created] = await tx
      .insert(propertyTransactions)
      .values({
        ...toPropertyTransactionInsertValues(body.value, property.userId ?? user.id),
        ...debtColumns,
      })
      .returning();
    await withLedgerWrite(
      tx,
      { table: properties, id: body.value.propertyId, partnerId, actorId: user.id },
      body.value.date,
    );
    return { data: created } as const;
  });
  if ('error' in result) return c.json({ error: result.error }, result.status);
  return c.json({ data: result.data }, HTTP_STATUS.CREATED);
});

// Applies an edited property transaction after its old effect was reversed, and returns the debt
// columns to store with it. A repayment edited on its own property stays with the debt it paid;
// one moved to another property, or a row that becomes a repayment, pays that property's current
// debt. Throws `LedgerEditRejected` so the reversal rolls back on a refusal.
async function applyEditedTransaction(
  tx: DbTransaction,
  edit: {
    previous: PropertyTransactionRow;
    previousDebt: RepaymentDebt | null;
    next: PropertyTransactionPayload;
    property: typeof properties.$inferSelect;
  },
): Promise<ReturnType<typeof repaymentDebtColumns>> {
  const { next, property } = edit;
  const keptDebt =
    next.type === 'repayment' && next.propertyId === edit.previous.propertyId
      ? edit.previousDebt
      : null;
  const validationError = validatePropertyTransactionPayload(next, property, keptDebt !== null);
  if (validationError) {
    throw new LedgerEditRejected({ error: validationError, status: HTTP_STATUS.BAD_REQUEST });
  }
  if (next.type !== 'repayment') return repaymentDebtColumns(null, 0);

  const debt = keptDebt ?? currentRepaymentDebt(property);
  const applied = await applyRepaymentToDebt(tx, debt, next.principal ?? 0);
  if (!applied) {
    throw new LedgerEditRejected({
      error: REPAYMENT_EXCEEDS_BALANCE,
      status: HTTP_STATUS.BAD_REQUEST,
    });
  }
  return repaymentDebtColumns(debt, applied.unapplied);
}

app.patch('/property-transactions/:id', async (c) => {
  const user = getAuthUser(c);
  const id = parseId(c.req.param('id'));
  if (id === null) return c.json({ error: 'Invalid transaction id' }, HTTP_STATUS.BAD_REQUEST);

  const partnerId = getPartnerId(c);
  const existing = await getAccessiblePropertyTransaction(user.id, partnerId, id);
  if (!existing) return c.json({ error: 'Transaction not found' }, HTTP_STATUS.NOT_FOUND);

  const rawBody = await readJsonBody(c.req, 'Invalid property transaction payload');
  if (!rawBody.ok) return c.json({ error: rawBody.error }, HTTP_STATUS.BAD_REQUEST);

  const body = parsePropertyTransactionPatch(rawBody.value);
  if (!body.ok) return c.json({ error: body.error }, HTTP_STATUS.BAD_REQUEST);
  if (Object.keys(body.value).length === 0) {
    return c.json({ error: 'No property transaction fields provided' }, HTTP_STATUS.BAD_REQUEST);
  }
  const nextPropertyId = body.value.propertyId ?? existing.propertyId;
  if (
    nextPropertyId !== existing.propertyId &&
    !(await getAccessibleProperty(user.id, partnerId, nextPropertyId))
  ) {
    return c.json({ error: 'Property not found' }, HTTP_STATUS.NOT_FOUND);
  }

  const result = await answerRejectedEdit<
    { data: typeof propertyTransactions.$inferSelect },
    LedgerRejection
  >(() =>
    db.transaction(async (tx) => {
      // Undo the committed repayment's balance effect, then apply the edited one. Once the old
      // effect is undone, a refusal must roll it back.
      const previous = await lockPropertyLedger(tx, existing, nextPropertyId);
      const next = mergePropertyTransactionPayload(body.value, previous);
      if (!next.ok) {
        throw new LedgerEditRejected({ error: next.error, status: HTTP_STATUS.BAD_REQUEST });
      }
      const previousDebt = await resolveRepaymentDebt(tx, user.id, partnerId, previous);
      if (previousDebt) await reverseRepaymentOnDebt(tx, previousDebt, previous);

      const property = await getAccessibleProperty(user.id, partnerId, next.value.propertyId, tx);
      if (!property) {
        throw new LedgerEditRejected({
          error: 'Property not found',
          status: HTTP_STATUS.NOT_FOUND,
        });
      }

      const debtColumns = await applyEditedTransaction(tx, {
        previous,
        previousDebt,
        next: next.value,
        property,
      });

      const [updated] = await tx
        .update(propertyTransactions)
        .set({
          ...toPropertyTransactionUpdateValues(next.value),
          ...debtColumns,
          userId: property.userId ?? user.id,
        })
        .where(eq(propertyTransactions.id, id))
        .returning();
      await withLedgerWrite(
        tx,
        [
          { table: properties, id: previous.propertyId, partnerId, actorId: user.id },
          { table: properties, id: next.value.propertyId, partnerId, actorId: user.id },
        ],
        earliestDate(previous.date, next.value.date),
      );
      return { data: updated };
    }),
  );
  if ('error' in result) return c.json({ error: result.error }, result.status);
  return c.json({ data: result.data });
});

app.delete('/property-transactions/:id', async (c) => {
  const user = getAuthUser(c);
  const id = parseId(c.req.param('id'));
  if (id === null) return c.json({ error: 'Invalid transaction id' }, HTTP_STATUS.BAD_REQUEST);
  const partnerId = getPartnerId(c);
  const existing = await getAccessiblePropertyTransaction(user.id, partnerId, id);
  if (!existing) return c.json({ error: 'Transaction not found' }, HTTP_STATUS.NOT_FOUND);

  const result = await answerRejectedEdit<
    { data: typeof propertyTransactions.$inferSelect },
    LedgerRejection
  >(() =>
    db.transaction(async (tx) => {
      // Restore the balance this repayment had reduced before removing it.
      const previous = await lockPropertyLedger(tx, existing, existing.propertyId);
      const debt = await resolveRepaymentDebt(tx, user.id, partnerId, previous);
      if (debt) await reverseRepaymentOnDebt(tx, debt, previous);

      const [deleted] = await tx
        .delete(propertyTransactions)
        .where(eq(propertyTransactions.id, id))
        .returning();
      await withLedgerWrite(
        tx,
        { table: properties, id: previous.propertyId, partnerId, actorId: user.id },
        previous.date,
      );
      return { data: deleted! };
    }),
  );
  if ('error' in result) return c.json({ error: result.error }, result.status);
  return c.json({ data: result.data });
});
export default app;
