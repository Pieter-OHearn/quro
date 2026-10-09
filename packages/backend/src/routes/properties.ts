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
import { and, eq, isNull } from 'drizzle-orm';
import { getAuthUser, getPartnerId } from '../lib/authUser';
import {
  applyRepayment,
  MORTGAGE_BALANCE,
  PROPERTY_MORTGAGE_BALANCE,
  reverseRepayment,
} from '../lib/balance';
import { HTTP_STATUS } from '../constants/http';
import { earliestDate } from '../lib/netWorth';
import { answerRejectedEdit, LedgerEditRejected, withLedgerWrite } from '../lib/ledgerWrite';
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
  parseNormalizedDecimal,
  parseNormalizedDecimalField,
  parseOptionalId,
  parseOptionalNormalizedDecimalField,
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
    parseNormalizedDecimalField(
      value,
      'Purchase price must be greater than zero',
      Number.MIN_VALUE,
    ),
  currentValue: (value) =>
    parseNormalizedDecimalField(value, 'Current value must be greater than zero', Number.MIN_VALUE),
  mortgage: (value) =>
    parseNormalizedDecimalField(value, 'Mortgage balance must be zero or greater', 0),
  mortgageId: (value) => {
    const parsed = parseOptionalId(value);
    return parsed === 'invalid' ? err('Invalid mortgage id') : ok(parsed);
  },
  monthlyRent: (value) =>
    parseNormalizedDecimalField(value, 'Monthly rent must be zero or greater', 0),
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
    parseNormalizedDecimalField(value, 'Amount must be greater than zero', Number.MIN_VALUE),
  interest: (value) =>
    parseOptionalNormalizedDecimalField(value, 'Interest must be zero or greater', 0),
  principal: (value) =>
    parseOptionalNormalizedDecimalField(value, 'Principal must be zero or greater', 0),
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
): string | null {
  if ((parseNormalizedDecimal(property.mortgage) ?? 0) <= 0 && property.mortgageId == null) {
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
): string | null {
  if (payload.type === 'repayment') return validatePropertyRepaymentPayload(payload, property);
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

// A property repayment reduces the linked mortgage's outstanding balance (the
// source of truth). For properties
// with no linked mortgage it reduces the property's own mortgage balance.
async function applyPropertyRepaymentEffect(
  tx: DbTransaction,
  property: typeof properties.$inferSelect,
  principal: number,
): Promise<string | null> {
  const { mortgageId } = property;
  const updatedBalance =
    mortgageId == null
      ? await applyRepayment(tx, PROPERTY_MORTGAGE_BALANCE, { id: property.id, principal })
      : await applyRepayment(tx, MORTGAGE_BALANCE, { id: mortgageId, principal });
  if (updatedBalance === null) {
    return 'Principal portion cannot exceed the current outstanding balance';
  }
  return null;
}

// Inverse of applyPropertyRepaymentEffect, used when a repayment is removed
// or edited.
async function reversePropertyRepaymentEffect(
  tx: DbTransaction,
  property: typeof properties.$inferSelect,
  principal: number,
): Promise<void> {
  if (property.mortgageId !== null) {
    await reverseRepayment(tx, MORTGAGE_BALANCE, { id: property.mortgageId, principal });
  } else {
    await reverseRepayment(tx, PROPERTY_MORTGAGE_BALANCE, { id: property.id, principal });
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
    .where(includeArchived ? accessPredicate : and(accessPredicate, isNull(properties.archivedAt)));
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

    if (body.value.type === 'repayment') {
      const effectError = await applyPropertyRepaymentEffect(
        tx,
        property,
        body.value.principal ?? 0,
      );
      if (effectError) return { error: effectError, status: HTTP_STATUS.BAD_REQUEST } as const;
    }

    const [created] = await tx
      .insert(propertyTransactions)
      .values(toPropertyTransactionInsertValues(body.value, property.userId ?? user.id))
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

  const merged = mergePropertyTransactionPayload(body.value, existing);
  if (!merged.ok) return c.json({ error: merged.error }, HTTP_STATUS.BAD_REQUEST);

  const result = await answerRejectedEdit<
    { data: typeof propertyTransactions.$inferSelect },
    { error: string; status: typeof HTTP_STATUS.BAD_REQUEST | typeof HTTP_STATUS.NOT_FOUND }
  >(() =>
    db.transaction(async (tx) => {
      // Undo the old repayment's balance effect, then apply the edited one. Once the old
      // effect is undone, a refusal must roll it back.
      if (existing.type === 'repayment') {
        const oldProperty = await getAccessibleProperty(
          user.id,
          partnerId,
          existing.propertyId,
          tx,
        );
        if (oldProperty)
          await reversePropertyRepaymentEffect(tx, oldProperty, existing.principal ?? 0);
      }

      const property = await getAccessibleProperty(user.id, partnerId, merged.value.propertyId, tx);
      if (!property) {
        throw new LedgerEditRejected({
          error: 'Property not found',
          status: HTTP_STATUS.NOT_FOUND,
        });
      }

      const validationError = validatePropertyTransactionPayload(merged.value, property);
      if (validationError) {
        throw new LedgerEditRejected({ error: validationError, status: HTTP_STATUS.BAD_REQUEST });
      }

      if (merged.value.type === 'repayment') {
        const effectError = await applyPropertyRepaymentEffect(
          tx,
          property,
          merged.value.principal ?? 0,
        );
        if (effectError) {
          throw new LedgerEditRejected({ error: effectError, status: HTTP_STATUS.BAD_REQUEST });
        }
      }

      const [updated] = await tx
        .update(propertyTransactions)
        .set({
          ...toPropertyTransactionUpdateValues(merged.value),
          userId: property.userId ?? user.id,
        })
        .where(eq(propertyTransactions.id, id))
        .returning();
      await withLedgerWrite(
        tx,
        [
          { table: properties, id: existing.propertyId, partnerId, actorId: user.id },
          { table: properties, id: merged.value.propertyId, partnerId, actorId: user.id },
        ],
        earliestDate(existing.date, merged.value.date),
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

  const data = await db.transaction(async (tx) => {
    // Restore the balance this repayment had reduced before removing it.
    if (existing.type === 'repayment') {
      const property = await getAccessibleProperty(user.id, partnerId, existing.propertyId, tx);
      if (property) await reversePropertyRepaymentEffect(tx, property, existing.principal ?? 0);
    }

    const [deleted] = await tx
      .delete(propertyTransactions)
      .where(eq(propertyTransactions.id, id))
      .returning();
    await withLedgerWrite(
      tx,
      { table: properties, id: existing.propertyId, partnerId, actorId: user.id },
      existing.date,
    );
    return deleted ?? null;
  });
  if (!data) return c.json({ error: 'Transaction not found' }, HTTP_STATUS.NOT_FOUND);
  return c.json({ data });
});
export default app;
