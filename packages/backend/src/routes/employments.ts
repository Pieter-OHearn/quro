import {
  EMPLOYMENT_TYPES,
  type Employment,
  type EmploymentInput,
  type EmploymentType,
} from '@quro/shared';
import { and, asc, eq, gte, isNull, ne, or } from 'drizzle-orm';
import { Hono } from 'hono';
import { HTTP_STATUS } from '../constants/http';
import { db } from '../db/client';
import { employments } from '../db/schema';
import { getAuthUser } from '../lib/authUser';
import {
  isRecord,
  parseDateString,
  parseId,
  readJsonBody,
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

function parseOptionalDate(
  value: unknown,
  label: string,
): { value: string | null } | { error: string } {
  if (value === null || value === '') return { value: null };
  const parsed = parseDateString(value);
  return parsed ? { value: parsed } : { error: `${label} must be a valid ISO date` };
}

// Keep create and patch validation in one strict field parser so both endpoints cannot drift.
// eslint-disable-next-line complexity, sonarjs/cognitive-complexity
function parseValues(
  raw: Record<string, unknown>,
  partial: boolean,
): { data: Partial<EmploymentValues> } | { error: string } {
  const strict = rejectUnknownFields(raw, FIELDS);
  if (!strict.ok) return { error: strict.error };
  const data: Partial<EmploymentValues> = {};
  if (!partial || 'employerName' in raw) {
    if (typeof raw.employerName !== 'string' || !raw.employerName.trim()) {
      return { error: 'Employer name is required' };
    }
    data.employerName = raw.employerName.trim();
  }
  if (!partial || 'employmentType' in raw) {
    if (
      typeof raw.employmentType !== 'string' ||
      !EMPLOYMENT_TYPES.includes(raw.employmentType as EmploymentType)
    ) {
      return { error: 'Invalid employment type' };
    }
    data.employmentType = raw.employmentType as EmploymentType;
  }
  for (const [field, label] of [
    ['serviceStartDate', 'Start date'],
    ['endDate', 'End date'],
  ] as const) {
    if (!partial || field in raw) {
      const parsed = parseOptionalDate(raw[field], label);
      if ('error' in parsed) return parsed;
      data[field] = parsed.value;
    }
  }
  if (!partial || 'noticePeriodMonths' in raw) {
    if (raw.noticePeriodMonths === null || raw.noticePeriodMonths === '') {
      data.noticePeriodMonths = null;
    } else if (
      !Number.isInteger(raw.noticePeriodMonths) ||
      Number(raw.noticePeriodMonths) < 0 ||
      Number(raw.noticePeriodMonths) > 24
    ) {
      return { error: 'Notice period must be 0 to 24 months' };
    } else {
      data.noticePeriodMonths = Number(raw.noticePeriodMonths);
    }
  }
  if ('isPrimary' in raw) {
    if (typeof raw.isPrimary !== 'boolean') return { error: 'Primary must be true or false' };
    data.isPrimary = raw.isPrimary;
  }
  if (data.serviceStartDate && data.endDate && data.endDate < data.serviceStartDate) {
    return { error: 'End date cannot be earlier than the start date' };
  }
  if (!partial && data.employmentType === 'employed' && !data.serviceStartDate) {
    return { error: 'Start date is required for employees' };
  }
  if (data.serviceStartDate && data.serviceStartDate > new Date().toISOString().slice(0, 10)) {
    return { error: 'Start date cannot be in the future' };
  }
  return { data };
}

async function readPayload(request: Pick<Request, 'json'>, partial: boolean) {
  const body = await readJsonBody(request, 'Invalid employment payload');
  if (!body.ok || !isRecord(body.value))
    return { error: body.ok ? 'Invalid employment payload' : body.error };
  if (partial && Object.keys(body.value).length === 0) return { error: 'No fields provided' };
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
  if ('error' in parsed) return c.json({ error: parsed.error }, HTTP_STATUS.BAD_REQUEST);
  const data = await db.transaction(async (tx) => {
    const existing = await tx
      .select({ id: employments.id })
      .from(employments)
      .where(eq(employments.userId, user.id));
    const isPrimary = parsed.data.isPrimary === true || existing.length === 0;
    if (isPrimary)
      await tx
        .update(employments)
        .set({ isPrimary: false, updatedAt: new Date() })
        .where(eq(employments.userId, user.id));
    const [created] = await tx
      .insert(employments)
      .values({
        userId: user.id,
        ...(parsed.data as EmploymentValues),
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
  if ('error' in parsed) return c.json({ error: parsed.error }, HTTP_STATUS.BAD_REQUEST);
  // The branches preserve date, ownership, and exactly-one-primary invariants.
  // eslint-disable-next-line complexity
  const data = await db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(employments)
      .where(and(eq(employments.id, id), eq(employments.userId, user.id)));
    if (!current) return null;
    if (current.isPrimary && parsed.data.isPrimary === false) return 'primary_error' as const;
    const merged = { ...current, ...parsed.data };
    if (merged.employmentType === 'employed' && !merged.serviceStartDate)
      return 'start_date_error' as const;
    if (merged.serviceStartDate && merged.endDate && merged.endDate < merged.serviceStartDate)
      return 'date_error' as const;
    const today = new Date().toISOString().slice(0, 10);
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
    if (parsed.data.isPrimary === true && !replacement)
      await tx
        .update(employments)
        .set({ isPrimary: false, updatedAt: new Date() })
        .where(eq(employments.userId, user.id));
    const [updated] = await tx
      .update(employments)
      .set({ ...parsed.data, ...(replacement ? { isPrimary: false } : {}), updatedAt: new Date() })
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
      const today = new Date().toISOString().slice(0, 10);
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
