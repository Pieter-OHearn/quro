import {
  EMPLOYMENT_TYPES,
  type Employment,
  type EmploymentInput,
  type EmploymentType,
  toIsoDate,
} from '@quro/shared';
import { and, asc, eq, gte, isNull, ne, or } from 'drizzle-orm';
import { Hono } from 'hono';
import { HTTP_STATUS } from '../constants/http';
import { db } from '../db/client';
import { employments } from '../db/schema';
import { getAuthUser } from '../lib/authUser';
import {
  err,
  type FieldParsers,
  ok,
  parseBooleanField,
  parseId,
  parseOptionalDateField,
  parsePatchFields,
  parseRequiredFields,
  type ParseResult,
  parseTextField,
  readJsonRecord,
  rejectUnknownFields,
} from '../lib/requestValidation';

const app = new Hono();
const FIELDS = [
  'employerName',
  'employmentType',
  'serviceStartDate',
  'endDate',
  'noticePeriodMonths',
  'isPrimary',
] as const;

type EmploymentValues = Omit<EmploymentInput, 'isPrimary'> & { isPrimary?: boolean };

function toDto(row: typeof employments.$inferSelect): Employment {
  return {
    id: row.id,
    employerName: row.employerName,
    employmentType: row.employmentType,
    serviceStartDate: row.serviceStartDate,
    endDate: row.endDate,
    noticePeriodMonths: row.noticePeriodMonths,
    isPrimary: row.isPrimary,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const MAX_NOTICE_PERIOD_MONTHS = 24;

function parseEmploymentTypeField(value: unknown): ParseResult<EmploymentType> {
  return typeof value === 'string' && EMPLOYMENT_TYPES.includes(value as EmploymentType)
    ? ok(value as EmploymentType)
    : err('Invalid employment type');
}

// These keys must be sent on create; `null` or '' clears them.
function parseNullableDateField(value: unknown, label: string): ParseResult<string | null> {
  const error = `${label} must be a valid ISO date`;
  return value === undefined ? err(error) : parseOptionalDateField(value, error);
}

function parseNoticePeriodField(value: unknown): ParseResult<number | null> {
  if (value === null || value === '') return ok(null);
  return typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= MAX_NOTICE_PERIOD_MONTHS
    ? ok(value)
    : err('Notice period must be 0 to 24 months');
}

// Keep create and patch validation in one strict field parser so both endpoints cannot drift.
const employmentParsers: FieldParsers<EmploymentValues> = {
  employerName: (value) => parseTextField(value, 'Employer name is required'),
  employmentType: parseEmploymentTypeField,
  serviceStartDate: (value) => parseNullableDateField(value, 'Start date'),
  endDate: (value) => parseNullableDateField(value, 'End date'),
  noticePeriodMonths: parseNoticePeriodField,
  isPrimary: (value) =>
    value === undefined ? ok(undefined) : parseBooleanField(value, 'Primary must be true or false'),
};

function validateEmploymentDates(
  data: Partial<EmploymentValues>,
  partial: boolean,
): ParseResult<void> {
  if (data.serviceStartDate && data.endDate && data.endDate < data.serviceStartDate) {
    return err('End date cannot be earlier than the start date');
  }
  if (!partial && data.employmentType === 'employed' && !data.serviceStartDate) {
    return err('Start date is required for employees');
  }
  if (data.serviceStartDate && data.serviceStartDate > toIsoDate(new Date())) {
    return err('Start date cannot be in the future');
  }
  return ok(undefined);
}

function parseValues(
  raw: Record<string, unknown>,
  partial: boolean,
): ParseResult<Partial<EmploymentValues>> {
  const strict = rejectUnknownFields(raw, FIELDS);
  if (!strict.ok) return strict;
  const parsed = partial
    ? parsePatchFields(raw, employmentParsers)
    : parseRequiredFields(raw, employmentParsers);
  if (!parsed.ok) return parsed;
  const dates = validateEmploymentDates(parsed.value, partial);
  return dates.ok ? parsed : dates;
}

async function readPayload(request: Pick<Request, 'json'>, partial: boolean) {
  const body = await readJsonRecord(request, 'Invalid employment payload');
  if (!body.ok) return body;
  if (partial && Object.keys(body.value).length === 0) return err('No fields provided');
  return parseValues(body.value, partial);
}

app.get('/', async (c) => {
  const user = getAuthUser(c);
  const rows = await db
    .select()
    .from(employments)
    .where(eq(employments.userId, user.id))
    .orderBy(asc(employments.id));
  return c.json({ data: rows.map(toDto) });
});

app.post('/', async (c) => {
  const user = getAuthUser(c);
  const parsed = await readPayload(c.req, false);
  if (!parsed.ok) return c.json({ error: parsed.error }, HTTP_STATUS.BAD_REQUEST);
  const data = await db.transaction(async (tx) => {
    const existing = await tx
      .select({ id: employments.id })
      .from(employments)
      .where(eq(employments.userId, user.id));
    const isPrimary = parsed.value.isPrimary === true || existing.length === 0;
    if (isPrimary)
      await tx
        .update(employments)
        .set({ isPrimary: false, updatedAt: new Date() })
        .where(eq(employments.userId, user.id));
    const [created] = await tx
      .insert(employments)
      .values({
        userId: user.id,
        ...(parsed.value as EmploymentValues),
        isPrimary,
        updatedAt: new Date(),
      })
      .returning();
    return created;
  });
  return c.json({ data: toDto(data) }, HTTP_STATUS.CREATED);
});

app.patch('/:id', async (c) => {
  const user = getAuthUser(c);
  const id = parseId(c.req.param('id'));
  if (!id) return c.json({ error: 'Invalid employment ID' }, HTTP_STATUS.BAD_REQUEST);
  const parsed = await readPayload(c.req, true);
  if (!parsed.ok) return c.json({ error: parsed.error }, HTTP_STATUS.BAD_REQUEST);
  // The branches preserve date, ownership, and exactly-one-primary invariants.
  // eslint-disable-next-line complexity
  const data = await db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(employments)
      .where(and(eq(employments.id, id), eq(employments.userId, user.id)));
    if (!current) return null;
    if (current.isPrimary && parsed.value.isPrimary === false) return 'primary_error' as const;
    const merged = { ...current, ...parsed.value };
    if (merged.employmentType === 'employed' && !merged.serviceStartDate)
      return 'start_date_error' as const;
    if (merged.serviceStartDate && merged.endDate && merged.endDate < merged.serviceStartDate)
      return 'date_error' as const;
    const today = toIsoDate(new Date());
    const shouldPromoteReplacement =
      current.isPrimary && merged.endDate !== null && merged.endDate < today;
    const [replacement] = shouldPromoteReplacement
      ? await tx
          .select({ id: employments.id })
          .from(employments)
          .where(
            and(
              eq(employments.userId, user.id),
              ne(employments.id, current.id),
              or(isNull(employments.endDate), gte(employments.endDate, today)),
            ),
          )
          .orderBy(asc(employments.id))
          .limit(1)
      : [];
    if (parsed.value.isPrimary === true && !replacement)
      await tx
        .update(employments)
        .set({ isPrimary: false, updatedAt: new Date() })
        .where(eq(employments.userId, user.id));
    const [updated] = await tx
      .update(employments)
      .set({ ...parsed.value, ...(replacement ? { isPrimary: false } : {}), updatedAt: new Date() })
      .where(eq(employments.id, id))
      .returning();
    if (replacement)
      await tx
        .update(employments)
        .set({ isPrimary: true, updatedAt: new Date() })
        .where(eq(employments.id, replacement.id));
    return updated;
  });
  if (data === null) return c.json({ error: 'Employment not found' }, HTTP_STATUS.NOT_FOUND);
  if (data === 'date_error')
    return c.json(
      { error: 'End date cannot be earlier than the start date' },
      HTTP_STATUS.BAD_REQUEST,
    );
  if (data === 'start_date_error')
    return c.json({ error: 'Start date is required for employees' }, HTTP_STATUS.BAD_REQUEST);
  if (data === 'primary_error')
    return c.json(
      { error: 'Promote another employment before removing the primary role' },
      HTTP_STATUS.BAD_REQUEST,
    );
  return c.json({ data: toDto(data) });
});

app.delete('/:id', async (c) => {
  const user = getAuthUser(c);
  const id = parseId(c.req.param('id'));
  if (!id) return c.json({ error: 'Invalid employment ID' }, HTTP_STATUS.BAD_REQUEST);
  const deleted = await db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(employments)
      .where(and(eq(employments.id, id), eq(employments.userId, user.id)));
    if (!current) return false;
    await tx.delete(employments).where(eq(employments.id, id));
    if (current.isPrimary) {
      const today = toIsoDate(new Date());
      const [active] = await tx
        .select()
        .from(employments)
        .where(
          and(
            eq(employments.userId, user.id),
            or(isNull(employments.endDate), gte(employments.endDate, today)),
          ),
        )
        .orderBy(asc(employments.id))
        .limit(1);
      const [fallback] = active
        ? [active]
        : await tx
            .select()
            .from(employments)
            .where(eq(employments.userId, user.id))
            .orderBy(asc(employments.id))
            .limit(1);
      const next = active ?? fallback;
      if (next)
        await tx
          .update(employments)
          .set({ isPrimary: true, updatedAt: new Date() })
          .where(eq(employments.id, next.id));
    }
    return true;
  });
  return deleted
    ? c.body(null, 204)
    : c.json({ error: 'Employment not found' }, HTTP_STATUS.NOT_FOUND);
});

export default app;
