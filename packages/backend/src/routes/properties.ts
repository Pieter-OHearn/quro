import { withPropertyEquity } from '../lib/propertyDebt';
import { registerTransactionReadRoutes } from '../lib/transactionRoutes';
import { registerArchivableResource } from '../lib/archivableResource';
import { findAccessible, findAccessibleChild } from '../lib/access';
import { Hono } from 'hono';
import {
  isInvestmentPropertyType,
  PROPERTY_TRANSACTION_TYPES,
  type CurrencyCode,
  type PropertyTransactionType,
  type PropertyTransactionPayload,
  TEXT_FIELD_LIMITS,
} from '@quro/shared';
import { db, type DbExecutor, type DbTransaction } from '../db/client';
import { mortgages, properties, propertyTransactions } from '../db/schema';
import { and, asc, desc, eq, isNull } from 'drizzle-orm';
import { getAuthUser, getPartnerId } from '../lib/authUser';
import { HTTP_STATUS } from '../constants/http';
import { earliestDate } from '../lib/netWorth';
import {
  answerRejectedEdit,
  LedgerEditRejected,
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
  parseOptionalId,
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

const VALUE_FROM_VALUATIONS =
  "This property's value comes from its latest valuation; record a valuation to change it";

const PROPERTY_FIELDS = [
  'address',
  'propertyType',
  'purchasePrice',
  'currentValue',
  'mortgageId',
  'monthlyRent',
  'currency',
  'emoji',
  'isJoint',
] as const;

const PROPERTY_TRANSACTION_FIELDS = ['propertyId', 'type', 'amount', 'date', 'note'] as const;

type PropertyPayload = {
  address: string;
  propertyType: string;
  purchasePrice: number;
  currentValue: number;
  mortgageId: number | null;
  monthlyRent: number;
  currency: CurrencyCode;
  emoji: string | null;
  isJoint: boolean;
};

type PropertyCreateRequiredPayload = Omit<PropertyPayload, 'mortgageId' | 'emoji' | 'isJoint'>;

// A property's ledger records what happens to the asset; repayments and rate changes belong to
// the mortgage's ledger.
function parsePropertyTransactionTypeField(value: unknown): ParseResult<PropertyTransactionType> {
  if (value === 'repayment' || value === 'rate_change') {
    return err('Record repayments and rate changes on the mortgage');
  }
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
  date: (value) => parseDateField(value, 'Transaction date must be a valid ISO date'),
  note: (value) => parseOptionalTextField(value, 'Transaction note must be a string'),
};

function parsePropertyCreate(body: unknown): ParseResult<PropertyPayload> {
  if (!isRecord(body)) return err('Invalid property payload');
  const strictCheck = rejectUnknownFields(body, PROPERTY_FIELDS);
  if (!strictCheck.ok) return strictCheck;
  const required = parseRequiredFields(body, propertyCreateRequiredParsers);
  if (!required.ok) return required;
  const mortgageId = propertyParsers.mortgageId(body.mortgageId);
  if (!mortgageId.ok) return mortgageId;
  const emoji = propertyParsers.emoji(body.emoji);
  if (!emoji.ok) return emoji;
  const isJoint = propertyParsers.isJoint(body.isJoint);
  if (!isJoint.ok) return isJoint;

  return ok({
    ...required.value,
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

  return parseRequiredFields(body, propertyTransactionParsers);
}

function parsePropertyTransactionPatch(
  body: unknown,
): ParseResult<Partial<PropertyTransactionPayload>> {
  if (!isRecord(body)) return err('Invalid property transaction payload');
  const strictCheck = rejectUnknownFields(body, PROPERTY_TRANSACTION_FIELDS);
  if (!strictCheck.ok) return strictCheck;
  return parsePatchFields(body, propertyTransactionParsers);
}

function isRentOrExpenseTransaction(type: PropertyTransactionType): boolean {
  return type === 'rent_income' || type === 'expense';
}

function validatePropertyTransactionPayload(
  payload: PropertyTransactionPayload,
  property: typeof properties.$inferSelect,
): string | null {
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
    date: patch.date ?? existing.date,
    note: patch.note === undefined ? existing.note : patch.note,
  });
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

// The latest valuation by date (ties by id), read inside the ledger transaction after the
// property was locked, so concurrent valuation writes on one property apply one after another.
async function latestValuation(tx: DbExecutor, propertyId: number): Promise<number | null> {
  const [latest] = await tx
    .select({ amount: propertyTransactions.amount })
    .from(propertyTransactions)
    .where(
      and(
        eq(propertyTransactions.propertyId, propertyId),
        eq(propertyTransactions.type, 'valuation'),
      ),
    )
    .orderBy(desc(propertyTransactions.date), desc(propertyTransactions.id))
    .limit(1);
  return latest?.amount ?? null;
}

// A property's current value is its latest valuation. A property whose last valuation was
// removed keeps the value it had, which is the value it was last entered or valued at.
async function syncCurrentValue(tx: DbTransaction, propertyIds: readonly number[]): Promise<void> {
  for (const propertyId of new Set(propertyIds)) {
    const amount = await latestValuation(tx, propertyId);
    if (amount === null) continue;
    await tx.update(properties).set({ currentValue: amount }).where(eq(properties.id, propertyId));
  }
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
// id only. The mortgage takes the property's currency, and jointness propagates
// to keep the linked pair consistent for the 50% dashboard weighting. Its address
// and value are read from the property, never copied.
async function syncLinkedMortgageMetadata(params: {
  mortgageId: number | null;
  property: typeof properties.$inferSelect;
  executor?: DbExecutor;
}): Promise<void> {
  if (params.mortgageId == null) return;

  await (params.executor ?? db)
    .update(mortgages)
    .set({ currency: params.property.currency, isJoint: params.property.isJoint })
    .where(eq(mortgages.id, params.mortgageId));
}

async function resolvePropertyMortgagePatch(params: {
  userId: number;
  partnerId: number | null;
  propertyId: number;
  existing: typeof properties.$inferSelect;
  patch: Partial<PropertyPayload>;
}): Promise<
  | { ok: true; value: { mortgageId: number | null; isJoint?: boolean } }
  | { ok: false; error: string; status: 404 | 409 }
> {
  const nextMortgageId = pickPatchedValue(params.patch.mortgageId, params.existing.mortgageId);
  if (nextMortgageId === null) return { ok: true, value: { mortgageId: null } };

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
  return c.json({ data: await withPropertyEquity(data) });
});

app.get('/properties/:id', async (c) => {
  const user = getAuthUser(c);
  const id = parseId(c.req.param('id'));
  if (id === null) return c.json({ error: 'Invalid property id' }, HTTP_STATUS.BAD_REQUEST);
  const partnerId = getPartnerId(c);
  const data = await getAccessibleProperty(user.id, partnerId, id);
  if (!data) return c.json({ error: 'Property not found' }, HTTP_STATUS.NOT_FOUND);
  return c.json({ data: (await withPropertyEquity([data]))[0] });
});

app.post('/properties', async (c) => {
  const user = getAuthUser(c);
  const rawBody = await readJsonBody(c.req, 'Invalid property payload');
  if (!rawBody.ok) return c.json({ error: rawBody.error }, HTTP_STATUS.BAD_REQUEST);

  const body = parsePropertyCreate(rawBody.value);
  if (!body.ok) return c.json({ error: body.error }, HTTP_STATUS.BAD_REQUEST);
  const lengths = await checkTextLimits(body.value, TEXT_FIELD_LIMITS.property);
  if (!lengths.ok) return c.json({ error: lengths.error }, HTTP_STATUS.BAD_REQUEST);

  const partnerId = getPartnerId(c);
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

    // A property linked to a joint mortgage is joint too (and vice versa).
    isJoint = isJoint || mortgage.isJoint;
  }

  const jointError = assertJointAllowed(getPartnerId(c), isJoint);
  if (jointError) return c.json({ error: jointError }, HTTP_STATUS.BAD_REQUEST);

  const propertyPayload = { ...body.value, isJoint };

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
  return c.json({ data: (await withPropertyEquity([data]))[0] }, HTTP_STATUS.CREATED);
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
  const lengths = await checkTextLimits(body.value, TEXT_FIELD_LIMITS.property, existing);
  if (!lengths.ok) return c.json({ error: lengths.error }, HTTP_STATUS.BAD_REQUEST);

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

  const result = await answerRejectedEdit<
    { data: typeof properties.$inferSelect },
    LedgerRejection
  >(() =>
    db.transaction(async (tx) => {
      // The linked mortgages first, then the property: the order a mortgage's cascade archive uses.
      await lockLedgerParents(tx, mortgages, [existing.mortgageId, updates.mortgageId]);
      const [locked] = await lockLedgerParents(tx, properties, [id]);
      if (
        updates.currentValue !== undefined &&
        locked &&
        updates.currentValue !== locked.currentValue &&
        (await latestValuation(tx, id)) !== null
      ) {
        throw new LedgerEditRejected({
          error: VALUE_FROM_VALUATIONS,
          status: HTTP_STATUS.BAD_REQUEST,
        });
      }
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
      return { data: updated };
    }),
  );
  if ('error' in result) return c.json({ error: result.error }, result.status);
  return c.json({ data: (await withPropertyEquity([result.data]))[0] });
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
  serialize: async (property) => (await withPropertyEquity([property]))[0],
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
  const lengths = await checkTextLimits(body.value, TEXT_FIELD_LIMITS.propertyTransaction);
  if (!lengths.ok) return c.json({ error: lengths.error }, HTTP_STATUS.BAD_REQUEST);

  const partnerId = getPartnerId(c);
  const result = await db.transaction(async (tx) => {
    const property = await getAccessibleProperty(user.id, partnerId, body.value.propertyId, tx);
    if (!property) return { error: 'Property not found', status: HTTP_STATUS.NOT_FOUND } as const;

    const validationError = validatePropertyTransactionPayload(body.value, property);
    if (validationError)
      return { error: validationError, status: HTTP_STATUS.BAD_REQUEST } as const;

    // The property is locked before its current value is recomputed from its valuations.
    await lockLedgerParents(tx, properties, [property.id]);
    const [created] = await tx
      .insert(propertyTransactions)
      .values(toPropertyTransactionInsertValues(body.value, property.userId ?? user.id))
      .returning();
    if (body.value.type === 'valuation') await syncCurrentValue(tx, [property.id]);
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

// eslint-disable-next-line complexity
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
  const lengths = await checkTextLimits(
    body.value,
    TEXT_FIELD_LIMITS.propertyTransaction,
    existing,
  );
  if (!lengths.ok) return c.json({ error: lengths.error }, HTTP_STATUS.BAD_REQUEST);
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
      // Both properties, then the row, in the order a cascade archive uses. The edit reads the
      // committed row from the lock, and both current values are recomputed from the valuations
      // that remain once it is written.
      await lockLedgerParents(tx, properties, [existing.propertyId, nextPropertyId]);
      const previous = await lockCheckedLedgerRow(
        tx,
        propertyTransactions,
        id,
        (row) => row.propertyId === existing.propertyId,
      );
      const next = mergePropertyTransactionPayload(body.value, previous);
      if (!next.ok) {
        throw new LedgerEditRejected({ error: next.error, status: HTTP_STATUS.BAD_REQUEST });
      }

      const property = await getAccessibleProperty(user.id, partnerId, next.value.propertyId, tx);
      if (!property) {
        throw new LedgerEditRejected({
          error: 'Property not found',
          status: HTTP_STATUS.NOT_FOUND,
        });
      }
      const validationError = validatePropertyTransactionPayload(next.value, property);
      if (validationError) {
        throw new LedgerEditRejected({ error: validationError, status: HTTP_STATUS.BAD_REQUEST });
      }

      const [updated] = await tx
        .update(propertyTransactions)
        .set({
          ...toPropertyTransactionUpdateValues(next.value),
          userId: property.userId ?? user.id,
        })
        .where(eq(propertyTransactions.id, id))
        .returning();
      if (previous.type === 'valuation' || next.value.type === 'valuation') {
        await syncCurrentValue(tx, [previous.propertyId, next.value.propertyId]);
      }
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
      await lockLedgerParents(tx, properties, [existing.propertyId]);
      const previous = await lockCheckedLedgerRow(
        tx,
        propertyTransactions,
        id,
        (row) => row.propertyId === existing.propertyId,
      );
      const [deleted] = await tx
        .delete(propertyTransactions)
        .where(eq(propertyTransactions.id, id))
        .returning();
      if (previous.type === 'valuation') await syncCurrentValue(tx, [previous.propertyId]);
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
