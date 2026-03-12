import { Hono } from 'hono';
import type { CurrencyCode } from '@quro/shared';
import { db } from '../db/client';
import { mortgages, mortgageTransactions, properties } from '../db/schema';
import { and, eq } from 'drizzle-orm';
import { getAuthUser } from '../lib/authUser';
import { HTTP_STATUS } from '../constants/http';
import {
  err,
  isRecord,
  ok,
  parseCurrencyField,
  parseDateField,
  parseId,
  parseIntegerField,
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
  'fixedUntil',
  'termYears',
  'startDate',
  'endDate',
  'overpaymentLimit',
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
const MORTGAGE_TRANSACTION_TYPES = ['repayment', 'valuation', 'rate_change'] as const;

type MortgageRateType = 'Fixed' | 'Variable';
type MortgageTransactionType = (typeof MORTGAGE_TRANSACTION_TYPES)[number];

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
  fixedUntil: string | null;
  termYears: number;
  startDate: string;
  endDate: string;
  overpaymentLimit: number | null;
};

type MortgageTransactionPayload = {
  mortgageId: number;
  type: MortgageTransactionType;
  amount: number;
  interest: number | null;
  principal: number | null;
  date: string;
  note: string | null;
  fixedYears: number | null;
};

function parseOptionalId(value: unknown): number | null | 'invalid' {
  if (value == null || value === '') return null;
  const parsed = parseId(String(value));
  if (parsed === null) return 'invalid';
  return parsed;
}

function pickPatchedValue<T, U>(patchValue: T | undefined, existingValue: U): T | U {
  return patchValue === undefined ? existingValue : patchValue;
}

type LinkedProperty = {
  id: number;
  address: string;
  currency: string;
  currentValue: unknown;
  mortgageId: number | null;
};

function toFiniteNumber(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number.parseFloat(String(value ?? ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function parseNormalizedDecimalField(
  value: unknown,
  error: string,
  min = Number.NEGATIVE_INFINITY,
): ParseResult<number> {
  const parsed = toFiniteNumber(value);
  return parsed === null || parsed < min ? err(error) : ok(parsed);
}

function parseOptionalNormalizedDecimalField(
  value: unknown,
  error: string,
  min = Number.NEGATIVE_INFINITY,
): ParseResult<number | null> {
  if (value == null || value === '') return ok(null);
  const parsed = toFiniteNumber(value);
  return parsed === null || parsed < min ? err(error) : ok(parsed);
}

function parseMortgageRateTypeField(value: unknown): ParseResult<MortgageRateType> {
  if (typeof value !== 'string') return err('Invalid mortgage rate type');
  const normalized = value.trim().toLowerCase();
  if (normalized === 'fixed') return ok('Fixed');
  if (normalized === 'variable') return ok('Variable');
  return err('Invalid mortgage rate type');
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
  fixedUntil: (value) => parseOptionalTextField(value, 'Fixed-until value must be a string'),
  termYears: (value) => parseIntegerField(value, 'Term years must be greater than zero', 1),
  startDate: (value) => parseTextField(value, 'Start date is required'),
  endDate: (value) => parseTextField(value, 'End date is required'),
  overpaymentLimit: (value) =>
    parseOptionalNormalizedDecimalField(value, 'Overpayment limit must be zero or greater', 0),
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
  propertyId: number,
  mortgageId: number,
): Promise<
  { ok: true; property: LinkedProperty } | { ok: false; error: string; status: 404 | 409 }
> {
  const [property] = await db
    .select({
      id: properties.id,
      address: properties.address,
      currency: properties.currency,
      currentValue: properties.currentValue,
      mortgageId: properties.mortgageId,
    })
    .from(properties)
    .where(and(eq(properties.id, propertyId), eq(properties.userId, userId)));
  if (!property) return { ok: false, error: 'Property not found', status: 404 };
  if (property.mortgageId != null && property.mortgageId !== mortgageId) {
    return { ok: false, error: 'Property already has a linked mortgage', status: 409 };
  }
  return { ok: true, property };
}

async function resolveLinkedProperty(
  rawLinkedPropertyId: unknown,
  currentPropertyId: number | null,
  userId: number,
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
  const result = await fetchLinkedProperty(userId, nextId, mortgageId);
  if (!result.ok) return { ok: false, error: result.error, status: result.status };
  return { ok: true, nextId, property: result.property };
}

async function getOwnedMortgage(userId: number, mortgageId: number) {
  const [mortgage] = await db
    .select()
    .from(mortgages)
    .where(and(eq(mortgages.id, mortgageId), eq(mortgages.userId, userId)));
  return mortgage ?? null;
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

async function getCurrentLinkedPropertyId(
  userId: number,
  mortgageId: number,
): Promise<number | null> {
  const [linkedProperty] = await db
    .select({ id: properties.id })
    .from(properties)
    .where(and(eq(properties.userId, userId), eq(properties.mortgageId, mortgageId)));
  return linkedProperty?.id ?? null;
}

async function prepareMortgagePatch(params: {
  userId: number;
  mortgageId: number;
  patch: Partial<MortgagePayload>;
}): Promise<
  | {
      ok: true;
      value: { currentPropertyId: number | null; nextPropertyId: number; property: LinkedProperty };
    }
  | { ok: false; error: string; status: 400 | 404 | 409 }
> {
  const currentPropertyId = await getCurrentLinkedPropertyId(params.userId, params.mortgageId);
  const resolved = await resolveLinkedProperty(
    params.patch.linkedPropertyId,
    currentPropertyId,
    params.userId,
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

async function syncLinkedProperty(
  userId: number,
  prevId: number | null,
  nextId: number | null,
  mortgageId: number,
  balance: unknown,
) {
  if (prevId != null && prevId !== nextId) {
    await db
      .update(properties)
      .set({ mortgageId: null, mortgage: 0 } as any)
      .where(and(eq(properties.id, prevId), eq(properties.userId, userId)));
  }
  if (nextId != null) {
    await db
      .update(properties)
      .set({ mortgageId, mortgage: balance } as any)
      .where(and(eq(properties.id, nextId), eq(properties.userId, userId)));
  }
}

function validateMortgagePayload(payload: MortgagePayload): string | null {
  if (payload.outstandingBalance > payload.originalAmount) {
    return 'Outstanding balance cannot exceed the original amount';
  }
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

function validateMortgageRepaymentBreakdown(
  amount: number,
  interest: number,
  principal: number,
): string | null {
  if (interest > amount) return 'Interest cannot exceed the total repayment amount';
  if (principal > amount) return 'Principal cannot exceed the total repayment amount';
  if (Math.abs(interest + principal - amount) > 0.01) {
    return 'Interest and principal must add up to the total repayment amount';
  }
  return null;
}

function normalizeRepaymentMortgageTransaction(
  payload: MortgageTransactionPayload,
): ParseResult<MortgageTransactionPayload> {
  const interest = payload.interest ?? 0;
  const principal = payload.principal ?? Number((payload.amount - interest).toFixed(2));
  const validationError = validateMortgageRepaymentBreakdown(payload.amount, interest, principal);
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
  if (payload.amount > 25) return err('Rate-change amount cannot exceed 25');
  if (payload.fixedYears == null || payload.fixedYears <= 0) {
    return err('Rate-change transactions require fixed years');
  }

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
    fixedUntil: pickPatchedValue(patch.fixedUntil, existing.fixedUntil),
    termYears: pickPatchedValue(patch.termYears, existing.termYears),
    startDate: pickPatchedValue(patch.startDate, existing.startDate),
    endDate: pickPatchedValue(patch.endDate, existing.endDate),
    overpaymentLimit: pickPatchedValue(patch.overpaymentLimit, existing.overpaymentLimit),
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
    originalAmount: payload.originalAmount.toString(),
    outstandingBalance: payload.outstandingBalance.toString(),
    propertyValue:
      toFiniteNumber(property.currentValue)?.toString() ?? payload.propertyValue.toString(),
    monthlyPayment: payload.monthlyPayment.toString(),
    interestRate: payload.interestRate.toString(),
    rateType: payload.rateType,
    fixedUntil: payload.fixedUntil ?? 'N/A',
    termYears: payload.termYears,
    startDate: payload.startDate,
    endDate: payload.endDate,
    overpaymentLimit: payload.overpaymentLimit?.toString() ?? null,
  };
}

function toMortgageTransactionValues(
  payload: MortgageTransactionPayload,
): Omit<typeof mortgageTransactions.$inferInsert, 'userId'> {
  return {
    mortgageId: payload.mortgageId,
    type: payload.type,
    amount: payload.amount.toString(),
    interest: payload.interest?.toString() ?? null,
    principal: payload.principal?.toString() ?? null,
    date: payload.date,
    note: payload.note,
    fixedYears: payload.fixedYears?.toString() ?? null,
  };
}

// ── Mortgages ────────────────────────────────────────────────────────────────

app.get('/', async (c) => {
  const user = getAuthUser(c);
  const data = await db.select().from(mortgages).where(eq(mortgages.userId, user.id));
  return c.json({ data });
});

// ── Mortgage Transactions ────────────────────────────────────────────────────

app.get('/transactions', async (c) => {
  const user = getAuthUser(c);
  const mortgageId = c.req.query('mortgageId');
  if (mortgageId) {
    const parsedMortgageId = parseId(mortgageId);
    if (parsedMortgageId === null)
      return c.json({ error: 'Invalid mortgage id' }, HTTP_STATUS.BAD_REQUEST);
    const data = await db
      .select()
      .from(mortgageTransactions)
      .where(
        and(
          eq(mortgageTransactions.mortgageId, parsedMortgageId),
          eq(mortgageTransactions.userId, user.id),
        ),
      );
    return c.json({ data });
  }
  const data = await db
    .select()
    .from(mortgageTransactions)
    .where(eq(mortgageTransactions.userId, user.id));
  return c.json({ data });
});

app.get('/:id', async (c) => {
  const user = getAuthUser(c);
  const id = parseId(c.req.param('id'));
  if (id === null) return c.json({ error: 'Invalid mortgage id' }, HTTP_STATUS.BAD_REQUEST);
  const [data] = await db
    .select()
    .from(mortgages)
    .where(and(eq(mortgages.id, id), eq(mortgages.userId, user.id)));
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

  const propertyResult = await fetchLinkedProperty(user.id, linkedPropertyId.value, 0);
  if (!propertyResult.ok) return c.json({ error: propertyResult.error }, propertyResult.status);
  const property = propertyResult.property;
  const propertyValue = toFiniteNumber(property.currentValue);
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

  const [data] = await db
    .insert(mortgages)
    .values({
      ...toMortgageValues(body.value, property),
      userId: user.id,
    })
    .returning();

  await db
    .update(properties)
    .set({
      mortgageId: data.id,
      mortgage: body.value.outstandingBalance.toString(),
    })
    .where(and(eq(properties.id, property.id), eq(properties.userId, user.id)));

  return c.json({ data }, HTTP_STATUS.CREATED);
});

app.patch('/:id', async (c) => {
  const user = getAuthUser(c);
  const id = parseId(c.req.param('id'));
  if (id === null) return c.json({ error: 'Invalid mortgage id' }, HTTP_STATUS.BAD_REQUEST);

  const existingMortgage = await getOwnedMortgage(user.id, id);
  if (!existingMortgage) return c.json({ error: 'Mortgage not found' }, HTTP_STATUS.NOT_FOUND);

  const body = await readMortgagePatchPayload(c.req);
  if (!body.ok) return c.json({ error: body.error }, body.status);
  const patchContext = await prepareMortgagePatch({
    userId: user.id,
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

  const [data] = await db
    .update(mortgages)
    .set(toMortgageValues(merged.value, patchContext.value.property))
    .where(and(eq(mortgages.id, id), eq(mortgages.userId, user.id)))
    .returning();

  await syncLinkedProperty(
    user.id,
    patchContext.value.currentPropertyId,
    patchContext.value.nextPropertyId,
    id,
    merged.value.outstandingBalance.toString(),
  );
  return c.json({ data });
});

app.delete('/:id', async (c) => {
  const user = getAuthUser(c);
  const id = parseId(c.req.param('id'));
  if (id === null) return c.json({ error: 'Invalid mortgage id' }, HTTP_STATUS.BAD_REQUEST);

  await db
    .update(properties)
    .set({ mortgageId: null, mortgage: 0 } as any)
    .where(and(eq(properties.mortgageId, id), eq(properties.userId, user.id)));

  const [data] = await db
    .delete(mortgages)
    .where(and(eq(mortgages.id, id), eq(mortgages.userId, user.id)))
    .returning();
  if (!data) return c.json({ error: 'Mortgage not found' }, HTTP_STATUS.NOT_FOUND);
  return c.json({ data });
});

app.get('/transactions/:id', async (c) => {
  const user = getAuthUser(c);
  const id = parseId(c.req.param('id'));
  if (id === null) return c.json({ error: 'Invalid transaction id' }, HTTP_STATUS.BAD_REQUEST);
  const [data] = await db
    .select()
    .from(mortgageTransactions)
    .where(and(eq(mortgageTransactions.id, id), eq(mortgageTransactions.userId, user.id)));
  if (!data) return c.json({ error: 'Transaction not found' }, HTTP_STATUS.NOT_FOUND);
  return c.json({ data });
});

app.post('/transactions', async (c) => {
  const user = getAuthUser(c);
  const rawBody = await readJsonBody(c.req, 'Invalid mortgage transaction payload');
  if (!rawBody.ok) return c.json({ error: rawBody.error }, HTTP_STATUS.BAD_REQUEST);

  const body = parseMortgageTransactionCreate(rawBody.value);
  if (!body.ok) return c.json({ error: body.error }, HTTP_STATUS.BAD_REQUEST);

  const [mortgage] = await db
    .select({ id: mortgages.id })
    .from(mortgages)
    .where(and(eq(mortgages.id, body.value.mortgageId), eq(mortgages.userId, user.id)));
  if (!mortgage) return c.json({ error: 'Mortgage not found' }, HTTP_STATUS.NOT_FOUND);

  const [data] = await db
    .insert(mortgageTransactions)
    .values({ ...toMortgageTransactionValues(body.value), userId: user.id })
    .returning();
  return c.json({ data }, HTTP_STATUS.CREATED);
});

app.patch('/transactions/:id', async (c) => {
  const user = getAuthUser(c);
  const id = parseId(c.req.param('id'));
  if (id === null) return c.json({ error: 'Invalid transaction id' }, HTTP_STATUS.BAD_REQUEST);

  const [existing] = await db
    .select()
    .from(mortgageTransactions)
    .where(and(eq(mortgageTransactions.id, id), eq(mortgageTransactions.userId, user.id)));
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

  const [mortgage] = await db
    .select({ id: mortgages.id })
    .from(mortgages)
    .where(and(eq(mortgages.id, merged.value.mortgageId), eq(mortgages.userId, user.id)));
  if (!mortgage) return c.json({ error: 'Mortgage not found' }, HTTP_STATUS.NOT_FOUND);

  const [data] = await db
    .update(mortgageTransactions)
    .set(toMortgageTransactionValues(merged.value))
    .where(and(eq(mortgageTransactions.id, id), eq(mortgageTransactions.userId, user.id)))
    .returning();
  return c.json({ data });
});

app.delete('/transactions/:id', async (c) => {
  const user = getAuthUser(c);
  const id = parseId(c.req.param('id'));
  if (id === null) return c.json({ error: 'Invalid transaction id' }, HTTP_STATUS.BAD_REQUEST);
  const [data] = await db
    .delete(mortgageTransactions)
    .where(and(eq(mortgageTransactions.id, id), eq(mortgageTransactions.userId, user.id)))
    .returning();
  if (!data) return c.json({ error: 'Transaction not found' }, HTTP_STATUS.NOT_FOUND);
  return c.json({ data });
});

export default app;
