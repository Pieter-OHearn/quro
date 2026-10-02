import { registerTransactionReadRoutes } from '../lib/transactionRoutes';
import { registerArchivableResource } from '../lib/archivableResource';
import { findAccessible, findAccessibleChild } from '../lib/access';
import { Hono } from 'hono';
import {
  MORTGAGE_RATE_TYPES,
  MORTGAGE_REPAYMENT_TYPES,
  MORTGAGE_TRANSACTION_TYPES,
  type CurrencyCode,
  type MortgageRateType,
  type MortgageRepaymentType,
  type MortgageTransactionType,
  toIsoDate,
  roundMoney,
  validateBalanceWithinOriginal,
  validateRateChange,
  validateRepaymentSplit,
  type MortgageTransactionPayload,
} from '@quro/shared';
import { db, type DbExecutor, type DbTransaction } from '../db/client';
import { mortgages, mortgageTransactions, properties } from '../db/schema';
import { and, eq, isNull } from 'drizzle-orm';
import { getAuthUser, getPartnerId } from '../lib/authUser';
import { applyRepayment, MORTGAGE_BALANCE, reverseRepayment } from '../lib/balance';
import { HTTP_STATUS } from '../constants/http';
import { earliestDate } from '../lib/netWorth';
import { withLedgerWrite } from '../lib/ledgerWrite';
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
  parseNormalizedDecimalField,
  parseNumber,
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
const MORTGAGE_FIELDS = [
  'linkedPropertyId',
  'propertyAddress',
  'lender',
  'currency',
  'originalAmount',
  'outstandingBalance',
  'propertyValue',
  'monthlyPayment',
  'interestRate',
  'rateType',
  'repaymentType',
  'fixedUntil',
  'termYears',
  'startDate',
  'endDate',
  'overpaymentLimit',
  'isJoint',
] as const;
const MORTGAGE_TRANSACTION_FIELDS = [
  'mortgageId',
  'type',
  'amount',
  'interest',
  'principal',
  'date',
  'note',
  'fixedYears',
] as const;

type MortgagePayload = {
  linkedPropertyId: number;
  propertyAddress: string;
  lender: string;
  currency: CurrencyCode;
  originalAmount: number;
  outstandingBalance: number;
  propertyValue: number;
  monthlyPayment: number;
  interestRate: number;
  rateType: MortgageRateType;
  repaymentType: MortgageRepaymentType;
  fixedUntil: string | null;
  termYears: number;
  startDate: string;
  endDate: string;
  overpaymentLimit: number | null;
  isJoint: boolean;
};

type LinkedProperty = {
  id: number;
  userId: number | null;
  address: string;
  currency: string;
  currentValue: unknown;
  mortgageId: number | null;
  isJoint: boolean;
};

function parseMortgageRateTypeField(value: unknown): ParseResult<MortgageRateType> {
  if (typeof value !== 'string') return err('Invalid mortgage rate type');
  const normalized = value.trim().toLowerCase();
  const rateType = MORTGAGE_RATE_TYPES.find((type) => type.toLowerCase() === normalized);
  return rateType ? ok(rateType) : err('Invalid mortgage rate type');
}

function parseMortgageRepaymentTypeField(value: unknown): ParseResult<MortgageRepaymentType> {
  // Keep older API clients compatible while the migration safely classifies
  // every existing mortgage as annuity.
  if (value === undefined) return ok('Annuity');
  if (typeof value !== 'string') return err('Invalid mortgage repayment type');
  const normalized = value.trim().toLowerCase();
  const repaymentType = MORTGAGE_REPAYMENT_TYPES.find((type) => type.toLowerCase() === normalized);
  return repaymentType ? ok(repaymentType) : err('Invalid mortgage repayment type');
}

function parseMortgageTransactionTypeField(value: unknown): ParseResult<MortgageTransactionType> {
  return typeof value === 'string' &&
    MORTGAGE_TRANSACTION_TYPES.includes(value as MortgageTransactionType)
    ? ok(value as MortgageTransactionType)
    : err('Invalid mortgage transaction type');
}

const mortgageParsers: FieldParsers<MortgagePayload> = {
  linkedPropertyId: (value) => parseIntegerField(value, 'linkedPropertyId is required', 1),
  propertyAddress: (value) => parseTextField(value, 'Property address is required'),
  lender: (value) => parseTextField(value, 'Lender is required'),
  currency: parseCurrencyField,
  originalAmount: (value) =>
    parseNormalizedDecimalField(
      value,
      'Original amount must be greater than zero',
      Number.MIN_VALUE,
    ),
  outstandingBalance: (value) =>
    parseNormalizedDecimalField(value, 'Outstanding balance must be zero or greater', 0),
  propertyValue: (value) =>
    parseNormalizedDecimalField(
      value,
      'Property value must be greater than zero',
      Number.MIN_VALUE,
    ),
  monthlyPayment: (value) =>
    parseNormalizedDecimalField(
      value,
      'Monthly payment must be greater than zero',
      Number.MIN_VALUE,
    ),
  interestRate: (value) =>
    parseNormalizedDecimalField(value, 'Interest rate must be zero or greater', 0),
  rateType: parseMortgageRateTypeField,
  repaymentType: parseMortgageRepaymentTypeField,
  fixedUntil: (value) => parseOptionalTextField(value, 'Fixed-until value must be a string'),
  termYears: (value) => parseIntegerField(value, 'Term years must be greater than zero', 1),
  startDate: (value) => parseTextField(value, 'Start date is required'),
  endDate: (value) => parseTextField(value, 'End date is required'),
  overpaymentLimit: (value) =>
    parseOptionalNormalizedDecimalField(value, 'Overpayment limit must be zero or greater', 0),
  isJoint: (value) =>
    value === undefined ? ok(false) : parseBooleanField(value, 'isJoint must be a boolean'),
};

const mortgageTransactionParsers: FieldParsers<MortgageTransactionPayload> = {
  mortgageId: (value) => parseIntegerField(value, 'Invalid mortgage id', 1),
  type: parseMortgageTransactionTypeField,
  amount: (value) =>
    parseNormalizedDecimalField(
      value,
      'Transaction amount must be greater than zero',
      Number.MIN_VALUE,
    ),
  interest: (value) =>
    parseOptionalNormalizedDecimalField(value, 'Interest must be zero or greater', 0),
  principal: (value) =>
    parseOptionalNormalizedDecimalField(value, 'Principal must be zero or greater', 0),
  date: (value) => parseDateField(value, 'Transaction date must be a valid ISO date'),
  note: (value) => parseOptionalTextField(value, 'Transaction note must be a string'),
  fixedYears: (value) =>
    parseOptionalNormalizedDecimalField(
      value,
      'Fixed years must be greater than zero',
      Number.MIN_VALUE,
    ),
};

function resolveNextPropertyId(
  raw: unknown,
  currentId: number | null,
): { ok: true; id: number | null } | { ok: false; error: string } {
  if (raw === undefined) return { ok: true, id: currentId };
  const parsed = parseOptionalId(raw);
  if (parsed === 'invalid') return { ok: false, error: 'Invalid linkedPropertyId' };
  if (parsed === null) return { ok: false, error: 'Mortgage must be linked to a property' };
  return { ok: true, id: parsed };
}

async function fetchLinkedProperty(
  userId: number,
  partnerId: number | null,
  propertyId: number,
  mortgageId: number,
): Promise<
  { ok: true; property: LinkedProperty } | { ok: false; error: string; status: 404 | 409 }
> {
  const property = await findAccessible(properties, propertyId, { userId, partnerId });
  if (!property) return { ok: false, error: 'Property not found', status: 404 };
  if (property.mortgageId != null && property.mortgageId !== mortgageId) {
    // An archived mortgage no longer "occupies" the property — allow
    // re-linking (e.g. remortgaging) by repointing the property.
    const [linked] = await db
      .select({ archivedAt: mortgages.archivedAt })
      .from(mortgages)
      .where(eq(mortgages.id, property.mortgageId));
    if (linked && linked.archivedAt == null) {
      return { ok: false, error: 'Property already has a linked mortgage', status: 409 };
    }
  }
  return { ok: true, property };
}

async function resolveLinkedProperty(
  rawLinkedPropertyId: unknown,
  currentPropertyId: number | null,
  userId: number,
  partnerId: number | null,
  mortgageId: number,
): Promise<
  | { ok: true; nextId: number | null; property: LinkedProperty | null }
  | { ok: false; error: string; status: 400 | 404 | 409 }
> {
  const nextIdResult = resolveNextPropertyId(rawLinkedPropertyId, currentPropertyId);
  if (!nextIdResult.ok)
    return { ok: false, error: nextIdResult.error, status: HTTP_STATUS.BAD_REQUEST };
  const nextId = nextIdResult.id;
  if (nextId == null) return { ok: true, nextId: null, property: null };
  const result = await fetchLinkedProperty(userId, partnerId, nextId, mortgageId);
  if (!result.ok) return { ok: false, error: result.error, status: result.status };
  return { ok: true, nextId, property: result.property };
}

function getAccessibleMortgage(
  userId: number,
  partnerId: number | null,
  mortgageId: number,
  executor: DbExecutor = db,
) {
  return findAccessible(mortgages, mortgageId, { userId, partnerId }, { executor });
}

// The mortgage is the source of truth for its balance; keep the linked
// property's denormalized snapshot in step so the dashboard and property
// cards stay consistent.
async function syncPropertyMortgageSnapshot(
  executor: DbExecutor,
  mortgageId: number,
  outstandingBalance: number,
): Promise<void> {
  await executor
    .update(properties)
    .set({ mortgage: outstandingBalance })
    .where(eq(properties.mortgageId, mortgageId));
}

function addYearsToIsoDate(isoDate: string, years: number): string {
  const base = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(base.getTime())) return 'N/A';
  base.setUTCFullYear(base.getUTCFullYear() + Math.round(years));
  return toIsoDate(base);
}

// Apply a transaction's effect to the mortgage: a repayment reduces the
// outstanding balance by its principal; a rate change updates the rate (and
// re-derives the fixed-until date). Returns an error string for invalid input.
async function applyMortgageTxnEffect(
  tx: DbTransaction,
  mortgage: typeof mortgages.$inferSelect,
  payload: MortgageTransactionPayload,
): Promise<string | null> {
  if (payload.type === 'repayment') {
    const principal = payload.principal ?? 0;
    const updatedBalance = await applyRepayment(tx, MORTGAGE_BALANCE, {
      id: mortgage.id,
      principal,
    });
    if (updatedBalance === null) {
      return 'Principal portion cannot exceed the current outstanding balance';
    }
    await syncPropertyMortgageSnapshot(tx, mortgage.id, updatedBalance);
    return null;
  }
  if (payload.type === 'rate_change') {
    const fixedUntil =
      payload.fixedYears != null
        ? addYearsToIsoDate(payload.date, payload.fixedYears)
        : mortgage.fixedUntil;
    await tx
      .update(mortgages)
      .set({ interestRate: payload.amount, rateType: 'Fixed', fixedUntil })
      .where(eq(mortgages.id, mortgage.id));
    return null;
  }
  return null;
}

// Reverse a repayment's balance effect. Rate changes are not reversible (the
// previous rate is not recorded), so they are intentionally left untouched.
async function reverseMortgageTxnEffect(
  tx: DbTransaction,
  mortgage: typeof mortgages.$inferSelect,
  txn: { type: string; principal: number | null },
): Promise<void> {
  if (txn.type !== 'repayment') return;
  const updatedBalance = await reverseRepayment(tx, MORTGAGE_BALANCE, {
    id: mortgage.id,
    principal: txn.principal ?? 0,
  });
  if (updatedBalance !== null) {
    await syncPropertyMortgageSnapshot(tx, mortgage.id, updatedBalance);
  }
}

async function readMortgagePatchPayload(
  request: Pick<Request, 'json'>,
): Promise<
  { ok: true; value: Partial<MortgagePayload> } | { ok: false; error: string; status: 400 }
> {
  const rawBody = await readJsonBody(request, 'Invalid mortgage payload');
  if (!rawBody.ok) {
    return { ok: false, error: rawBody.error, status: HTTP_STATUS.BAD_REQUEST };
  }

  const body = parseMortgagePatch(rawBody.value);
  if (!body.ok) {
    return { ok: false, error: body.error, status: HTTP_STATUS.BAD_REQUEST };
  }
  if (Object.keys(body.value).length === 0) {
    return {
      ok: false,
      error: 'No mortgage fields provided',
      status: HTTP_STATUS.BAD_REQUEST,
    };
  }

  return body;
}

// The mortgage has already been access-checked, so the linked-property lookup
// is by mortgageId alone (the property may belong to the partner).
async function getCurrentLinkedPropertyId(
  mortgageId: number,
  executor: DbExecutor = db,
): Promise<number | null> {
  const [linkedProperty] = await executor
    .select({ id: properties.id })
    .from(properties)
    .where(eq(properties.mortgageId, mortgageId));
  return linkedProperty?.id ?? null;
}

async function prepareMortgagePatch(params: {
  userId: number;
  partnerId: number | null;
  mortgageId: number;
  patch: Partial<MortgagePayload>;
}): Promise<
  | {
      ok: true;
      value: { currentPropertyId: number | null; nextPropertyId: number; property: LinkedProperty };
    }
  | { ok: false; error: string; status: 400 | 404 | 409 }
> {
  const currentPropertyId = await getCurrentLinkedPropertyId(params.mortgageId);
  const resolved = await resolveLinkedProperty(
    params.patch.linkedPropertyId,
    currentPropertyId,
    params.userId,
    params.partnerId,
    params.mortgageId,
  );
  if (!resolved.ok) return resolved;
  if (!resolved.property || resolved.nextId == null) {
    return {
      ok: false,
      error: 'Mortgage must be linked to a property',
      status: HTTP_STATUS.BAD_REQUEST,
    };
  }

  return {
    ok: true,
    value: {
      currentPropertyId,
      nextPropertyId: resolved.nextId,
      property: resolved.property,
    },
  };
}

// Property ids come from access-checked resolution, so updates are by id only.
// Jointness propagates to the linked property to keep the pair's 50% dashboard
// weighting consistent (equity = value - mortgage balance).
async function syncLinkedProperty(
  executor: DbExecutor,
  prevId: number | null,
  nextId: number | null,
  mortgageId: number,
  balance: number,
  isJoint: boolean,
) {
  if (prevId != null && prevId !== nextId) {
    await executor
      .update(properties)
      .set({ mortgageId: null, mortgage: 0 })
      .where(eq(properties.id, prevId));
  }
  if (nextId != null) {
    await executor
      .update(properties)
      .set({ mortgageId, mortgage: balance, isJoint })
      .where(eq(properties.id, nextId));
  }
}

function validateMortgagePayload(payload: MortgagePayload): string | null {
  const balanceError = validateBalanceWithinOriginal(
    payload.originalAmount,
    payload.outstandingBalance,
    'Outstanding balance',
  );
  if (balanceError) return balanceError;
  if (payload.rateType === 'Fixed' && !payload.fixedUntil) {
    return 'Fixed mortgages require a fixed-until value';
  }
  if (payload.overpaymentLimit != null && payload.overpaymentLimit > 100) {
    return 'Overpayment limit cannot exceed 100';
  }
  return null;
}

function normalizeMortgagePayload(payload: MortgagePayload): MortgagePayload {
  return {
    ...payload,
    fixedUntil: payload.rateType === 'Fixed' ? payload.fixedUntil : 'N/A',
  };
}

function parseMortgageCreate(body: unknown): ParseResult<MortgagePayload> {
  if (!isRecord(body)) return err('Invalid mortgage payload');
  const strictCheck = rejectUnknownFields(body, MORTGAGE_FIELDS);
  if (!strictCheck.ok) return strictCheck;

  const parsed = parseRequiredFields(body, mortgageParsers);
  if (!parsed.ok) return parsed;

  const normalized = normalizeMortgagePayload(parsed.value);
  const validationError = validateMortgagePayload(normalized);
  return validationError ? err(validationError) : ok(normalized);
}

function parseMortgagePatch(body: unknown): ParseResult<Partial<MortgagePayload>> {
  if (!isRecord(body)) return err('Invalid mortgage payload');
  const strictCheck = rejectUnknownFields(body, MORTGAGE_FIELDS);
  if (!strictCheck.ok) return strictCheck;
  return parsePatchFields(body, mortgageParsers);
}

function parseMortgageTransactionCreate(body: unknown): ParseResult<MortgageTransactionPayload> {
  if (!isRecord(body)) return err('Invalid mortgage transaction payload');
  const strictCheck = rejectUnknownFields(body, MORTGAGE_TRANSACTION_FIELDS);
  if (!strictCheck.ok) return strictCheck;

  const parsed = parseRequiredFields(body, mortgageTransactionParsers);
  if (!parsed.ok) return parsed;
  return validateMortgageTransactionPayload(parsed.value);
}

function parseMortgageTransactionPatch(
  body: unknown,
): ParseResult<Partial<MortgageTransactionPayload>> {
  if (!isRecord(body)) return err('Invalid mortgage transaction payload');
  const strictCheck = rejectUnknownFields(body, MORTGAGE_TRANSACTION_FIELDS);
  if (!strictCheck.ok) return strictCheck;
  return parsePatchFields(body, mortgageTransactionParsers);
}

function normalizeRepaymentMortgageTransaction(
  payload: MortgageTransactionPayload,
): ParseResult<MortgageTransactionPayload> {
  const interest = payload.interest ?? 0;
  const principal = payload.principal ?? roundMoney(payload.amount - interest);
  const validationError = validateRepaymentSplit({ amount: payload.amount, interest, principal });
  if (validationError) return err(validationError);

  return ok({
    ...payload,
    interest,
    principal,
    fixedYears: null,
  });
}

function normalizeRateChangeMortgageTransaction(
  payload: MortgageTransactionPayload,
): ParseResult<MortgageTransactionPayload> {
  const rateChangeError = validateRateChange(payload.amount, payload.fixedYears);
  if (rateChangeError) return err(rateChangeError);

  return ok({
    ...payload,
    interest: null,
    principal: null,
  });
}

function normalizeInformationalMortgageTransaction(
  payload: MortgageTransactionPayload,
): ParseResult<MortgageTransactionPayload> {
  return ok({
    ...payload,
    interest: null,
    principal: null,
    fixedYears: null,
  });
}

function validateMortgageTransactionPayload(
  payload: MortgageTransactionPayload,
): ParseResult<MortgageTransactionPayload> {
  if (payload.type === 'repayment') return normalizeRepaymentMortgageTransaction(payload);
  if (payload.type === 'rate_change') return normalizeRateChangeMortgageTransaction(payload);
  return normalizeInformationalMortgageTransaction(payload);
}

function mergeMortgagePayload(
  patch: Partial<MortgagePayload>,
  existing: typeof mortgages.$inferSelect,
  linkedPropertyId: number,
): ParseResult<MortgagePayload> {
  return parseMortgageCreate({
    linkedPropertyId,
    propertyAddress: pickPatchedValue(patch.propertyAddress, existing.propertyAddress),
    lender: pickPatchedValue(patch.lender, existing.lender),
    currency: pickPatchedValue(patch.currency, existing.currency),
    originalAmount: pickPatchedValue(patch.originalAmount, existing.originalAmount),
    outstandingBalance: pickPatchedValue(patch.outstandingBalance, existing.outstandingBalance),
    propertyValue: pickPatchedValue(patch.propertyValue, existing.propertyValue),
    monthlyPayment: pickPatchedValue(patch.monthlyPayment, existing.monthlyPayment),
    interestRate: pickPatchedValue(patch.interestRate, existing.interestRate),
    rateType: pickPatchedValue(patch.rateType, existing.rateType),
    repaymentType: pickPatchedValue(patch.repaymentType, existing.repaymentType),
    fixedUntil: pickPatchedValue(patch.fixedUntil, existing.fixedUntil),
    termYears: pickPatchedValue(patch.termYears, existing.termYears),
    startDate: pickPatchedValue(patch.startDate, existing.startDate),
    endDate: pickPatchedValue(patch.endDate, existing.endDate),
    overpaymentLimit: pickPatchedValue(patch.overpaymentLimit, existing.overpaymentLimit),
    isJoint: pickPatchedValue(patch.isJoint, existing.isJoint),
  });
}

function mergeMortgageTransactionPayload(
  patch: Partial<MortgageTransactionPayload>,
  existing: typeof mortgageTransactions.$inferSelect,
): ParseResult<MortgageTransactionPayload> {
  return parseMortgageTransactionCreate({
    mortgageId: patch.mortgageId ?? existing.mortgageId,
    type: patch.type ?? existing.type,
    amount: patch.amount ?? existing.amount,
    interest: patch.interest === undefined ? existing.interest : patch.interest,
    principal: patch.principal === undefined ? existing.principal : patch.principal,
    date: patch.date ?? existing.date,
    note: patch.note === undefined ? existing.note : patch.note,
    fixedYears: patch.fixedYears === undefined ? existing.fixedYears : patch.fixedYears,
  });
}

function toMortgageValues(
  payload: MortgagePayload,
  property: LinkedProperty,
): Omit<typeof mortgages.$inferInsert, 'userId'> {
  return {
    propertyAddress: property.address,
    lender: payload.lender,
    currency: property.currency as CurrencyCode,
    originalAmount: payload.originalAmount,
    outstandingBalance: payload.outstandingBalance,
    propertyValue: parseNumber(property.currentValue) ?? payload.propertyValue,
    monthlyPayment: payload.monthlyPayment,
    interestRate: payload.interestRate,
    rateType: payload.rateType,
    repaymentType: payload.repaymentType,
    fixedUntil: payload.fixedUntil ?? 'N/A',
    termYears: payload.termYears,
    startDate: payload.startDate,
    endDate: payload.endDate,
    overpaymentLimit: payload.overpaymentLimit ?? null,
    isJoint: payload.isJoint,
  };
}

function toMortgageTransactionValues(
  payload: MortgageTransactionPayload,
): Omit<typeof mortgageTransactions.$inferInsert, 'userId'> {
  return {
    mortgageId: payload.mortgageId,
    type: payload.type,
    amount: payload.amount,
    interest: payload.interest ?? null,
    principal: payload.principal ?? null,
    date: payload.date,
    note: payload.note,
    fixedYears: payload.fixedYears ?? null,
  };
}

// ── Mortgages ────────────────────────────────────────────────────────────────

app.get('/', async (c) => {
  const user = getAuthUser(c);
  const partnerId = getPartnerId(c);
  const includeArchived = c.req.query('includeArchived') === 'true';
  const accessPredicate = ownedOrJointPredicate(mortgages, user.id, partnerId);
  const data = await db
    .select()
    .from(mortgages)
    .where(includeArchived ? accessPredicate : and(accessPredicate, isNull(mortgages.archivedAt)));
  return c.json({ data });
});

// ── Mortgage Transactions ────────────────────────────────────────────────────

registerTransactionReadRoutes(app, {
  path: '/transactions',
  table: mortgageTransactions,
  parent: mortgages,
  parentId: mortgageTransactions.mortgageId,
  parentQuery: 'mortgageId',
  parentLabel: 'Mortgage',
  parentIdLabel: 'mortgage',
  checkParent: true,
  emptyParentIsAbsent: true,
  scopeByChildOwner: false,
});

app.get('/:id', async (c) => {
  const user = getAuthUser(c);
  const id = parseId(c.req.param('id'));
  if (id === null) return c.json({ error: 'Invalid mortgage id' }, HTTP_STATUS.BAD_REQUEST);
  const partnerId = getPartnerId(c);
  const data = await getAccessibleMortgage(user.id, partnerId, id);
  if (!data) return c.json({ error: 'Mortgage not found' }, HTTP_STATUS.NOT_FOUND);
  return c.json({ data });
});

app.post('/', async (c) => {
  const user = getAuthUser(c);
  const rawBody = await readJsonBody(c.req, 'Invalid mortgage payload');
  if (!rawBody.ok) return c.json({ error: rawBody.error }, HTTP_STATUS.BAD_REQUEST);

  if (!isRecord(rawBody.value)) {
    return c.json({ error: 'Invalid mortgage payload' }, HTTP_STATUS.BAD_REQUEST);
  }

  const linkedPropertyId = parseIntegerField(
    rawBody.value.linkedPropertyId,
    'linkedPropertyId is required',
    1,
  );
  if (!linkedPropertyId.ok)
    return c.json({ error: linkedPropertyId.error }, HTTP_STATUS.BAD_REQUEST);

  const partnerId = getPartnerId(c);
  const propertyResult = await fetchLinkedProperty(user.id, partnerId, linkedPropertyId.value, 0);
  if (!propertyResult.ok) return c.json({ error: propertyResult.error }, propertyResult.status);
  const property = propertyResult.property;
  const propertyValue = parseNumber(property.currentValue);
  if (propertyValue === null || propertyValue <= 0) {
    return c.json({ error: 'Property value must be greater than zero' }, HTTP_STATUS.BAD_REQUEST);
  }

  const body = parseMortgageCreate({
    ...rawBody.value,
    propertyAddress: property.address,
    currency: property.currency,
    propertyValue,
  });
  if (!body.ok) return c.json({ error: body.error }, HTTP_STATUS.BAD_REQUEST);

  // A mortgage linked to a joint property is joint too (and vice versa).
  const isJoint = body.value.isJoint || property.isJoint;
  const jointError = assertJointAllowed(getPartnerId(c), isJoint);
  if (jointError) return c.json({ error: jointError }, HTTP_STATUS.BAD_REQUEST);

  const data = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(mortgages)
      .values({
        ...toMortgageValues({ ...body.value, isJoint }, property),
        userId: user.id,
      })
      .returning();

    await tx
      .update(properties)
      .set({
        mortgageId: created.id,
        mortgage: body.value.outstandingBalance,
        isJoint,
      })
      .where(eq(properties.id, property.id));

    return created;
  });

  return c.json({ data }, HTTP_STATUS.CREATED);
});

app.patch('/:id', async (c) => {
  const user = getAuthUser(c);
  const id = parseId(c.req.param('id'));
  if (id === null) return c.json({ error: 'Invalid mortgage id' }, HTTP_STATUS.BAD_REQUEST);

  const partnerId = getPartnerId(c);
  const existingMortgage = await getAccessibleMortgage(user.id, partnerId, id);
  if (!existingMortgage) return c.json({ error: 'Mortgage not found' }, HTTP_STATUS.NOT_FOUND);

  const body = await readMortgagePatchPayload(c.req);
  if (!body.ok) return c.json({ error: body.error }, body.status);
  const patchContext = await prepareMortgagePatch({
    userId: user.id,
    partnerId,
    mortgageId: id,
    patch: body.value,
  });
  if (!patchContext.ok) return c.json({ error: patchContext.error }, patchContext.status);

  const merged = mergeMortgagePayload(
    body.value,
    existingMortgage,
    patchContext.value.nextPropertyId,
  );
  if (!merged.ok) return c.json({ error: merged.error }, HTTP_STATUS.BAD_REQUEST);

  const jointError = assertJointAllowed(getPartnerId(c), merged.value.isJoint);
  if (jointError) return c.json({ error: jointError }, HTTP_STATUS.BAD_REQUEST);

  const data = await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(mortgages)
      .set(toMortgageValues(merged.value, patchContext.value.property))
      .where(eq(mortgages.id, id))
      .returning();

    await syncLinkedProperty(
      tx,
      patchContext.value.currentPropertyId,
      patchContext.value.nextPropertyId,
      id,
      merged.value.outstandingBalance,
      merged.value.isJoint,
    );
    return updated;
  });
  return c.json({ data });
});

registerArchivableResource(app, {
  path: '',
  table: mortgages,
  label: 'Mortgage',
  idLabel: 'mortgage',
  beforeDelete: async (tx, mortgage) => {
    await tx
      .update(properties)
      .set({ mortgageId: null, mortgage: 0 })
      .where(eq(properties.mortgageId, mortgage.id));
    return null;
  },
  beforeUnarchive: async (tx, mortgage) => {
    if ((await getCurrentLinkedPropertyId(mortgage.id, tx)) == null) {
      return {
        error: 'The linked property now belongs to another mortgage; re-link it first',
        status: HTTP_STATUS.CONFLICT,
      };
    }
    return null;
  },
});

app.post('/transactions', async (c) => {
  const user = getAuthUser(c);
  const rawBody = await readJsonBody(c.req, 'Invalid mortgage transaction payload');
  if (!rawBody.ok) return c.json({ error: rawBody.error }, HTTP_STATUS.BAD_REQUEST);

  const body = parseMortgageTransactionCreate(rawBody.value);
  if (!body.ok) return c.json({ error: body.error }, HTTP_STATUS.BAD_REQUEST);

  const partnerId = getPartnerId(c);
  const result = await db.transaction(async (tx) => {
    const mortgage = await getAccessibleMortgage(user.id, partnerId, body.value.mortgageId, tx);
    if (!mortgage) return { error: 'Mortgage not found', status: HTTP_STATUS.NOT_FOUND } as const;

    const effectError = await applyMortgageTxnEffect(tx, mortgage, body.value);
    if (effectError) return { error: effectError, status: HTTP_STATUS.BAD_REQUEST } as const;

    const [created] = await tx
      .insert(mortgageTransactions)
      .values({ ...toMortgageTransactionValues(body.value), userId: mortgage.userId ?? user.id })
      .returning();
    await withLedgerWrite(
      tx,
      { table: mortgages, id: body.value.mortgageId, partnerId, actorId: user.id },
      body.value.date,
    );
    return { data: created } as const;
  });
  if ('error' in result) return c.json({ error: result.error }, result.status);
  return c.json({ data: result.data }, HTTP_STATUS.CREATED);
});

app.patch('/transactions/:id', async (c) => {
  const user = getAuthUser(c);
  const id = parseId(c.req.param('id'));
  if (id === null) return c.json({ error: 'Invalid transaction id' }, HTTP_STATUS.BAD_REQUEST);

  const partnerId = getPartnerId(c);
  const existing = await findAccessibleChild(
    { table: mortgageTransactions, parent: mortgages, parentId: mortgageTransactions.mortgageId },
    id,
    { userId: user.id, partnerId },
  );
  if (!existing) return c.json({ error: 'Transaction not found' }, HTTP_STATUS.NOT_FOUND);

  const rawBody = await readJsonBody(c.req, 'Invalid mortgage transaction payload');
  if (!rawBody.ok) return c.json({ error: rawBody.error }, HTTP_STATUS.BAD_REQUEST);

  const body = parseMortgageTransactionPatch(rawBody.value);
  if (!body.ok) return c.json({ error: body.error }, HTTP_STATUS.BAD_REQUEST);
  if (Object.keys(body.value).length === 0) {
    return c.json({ error: 'No mortgage transaction fields provided' }, HTTP_STATUS.BAD_REQUEST);
  }

  const merged = mergeMortgageTransactionPayload(body.value, existing);
  if (!merged.ok) return c.json({ error: merged.error }, HTTP_STATUS.BAD_REQUEST);

  const result = await db.transaction(async (tx) => {
    // Undo the old transaction's balance effect, then apply the edited one
    // against the freshly-restored balance.
    const oldMortgage = await getAccessibleMortgage(user.id, partnerId, existing.mortgageId, tx);
    if (oldMortgage) await reverseMortgageTxnEffect(tx, oldMortgage, existing);

    const mortgage = await getAccessibleMortgage(user.id, partnerId, merged.value.mortgageId, tx);
    if (!mortgage) return { error: 'Mortgage not found', status: HTTP_STATUS.NOT_FOUND } as const;

    const effectError = await applyMortgageTxnEffect(tx, mortgage, merged.value);
    if (effectError) return { error: effectError, status: HTTP_STATUS.BAD_REQUEST } as const;

    const [updated] = await tx
      .update(mortgageTransactions)
      .set({ ...toMortgageTransactionValues(merged.value), userId: mortgage.userId ?? user.id })
      .where(eq(mortgageTransactions.id, id))
      .returning();
    await withLedgerWrite(
      tx,
      [
        { table: mortgages, id: existing.mortgageId, partnerId, actorId: user.id },
        { table: mortgages, id: merged.value.mortgageId, partnerId, actorId: user.id },
      ],
      earliestDate(existing.date, merged.value.date),
    );
    return { data: updated } as const;
  });
  if ('error' in result) return c.json({ error: result.error }, result.status);
  return c.json({ data: result.data });
});

app.delete('/transactions/:id', async (c) => {
  const user = getAuthUser(c);
  const id = parseId(c.req.param('id'));
  if (id === null) return c.json({ error: 'Invalid transaction id' }, HTTP_STATUS.BAD_REQUEST);
  const partnerId = getPartnerId(c);
  const existing = await findAccessibleChild(
    { table: mortgageTransactions, parent: mortgages, parentId: mortgageTransactions.mortgageId },
    id,
    { userId: user.id, partnerId },
  );
  if (!existing) return c.json({ error: 'Transaction not found' }, HTTP_STATUS.NOT_FOUND);

  const data = await db.transaction(async (tx) => {
    // Restore the balance this repayment had reduced before removing it.
    const mortgage = await getAccessibleMortgage(user.id, partnerId, existing.mortgageId, tx);
    if (mortgage) await reverseMortgageTxnEffect(tx, mortgage, existing);

    const [deleted] = await tx
      .delete(mortgageTransactions)
      .where(eq(mortgageTransactions.id, id))
      .returning();
    await withLedgerWrite(
      tx,
      { table: mortgages, id: existing.mortgageId, partnerId, actorId: user.id },
      existing.date,
    );
    return deleted ?? null;
  });
  if (!data) return c.json({ error: 'Transaction not found' }, HTTP_STATUS.NOT_FOUND);
  return c.json({ data });
});

export default app;
