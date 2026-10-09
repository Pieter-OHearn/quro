import { Hono } from 'hono';
import {
  MAX_RETIREMENT_AGE,
  MAX_USER_AGE,
  MIN_PASSWORD_LENGTH,
  MIN_RETIREMENT_AGE,
  MIN_USER_AGE,
  isNumberFormatPreference,
  isCurrencyCode,
  isJurisdictionCode,
  type UpdateUserPasswordInput,
  type UpdateUserPreferencesInput,
  type UpdateUserProfileInput,
} from '@quro/shared';
import { and, eq, ne } from 'drizzle-orm';
import { db } from '../db/client';
import { users } from '../db/schema';
import { HTTP_STATUS } from '../constants/http';
import { getAuthUser, getSessionId } from '../lib/authUser';
import { publicUserColumns } from '../lib/users';
import { listUserSessions, revokeUserSession, revokeUserSessions } from '../lib/sessions';
import { changePasswordRateLimit } from '../middleware/rateLimit';
import {
  err,
  ok,
  parseWholeNumber,
  readJsonRecord,
  type ParseResult,
} from '../lib/requestValidation';

const app = new Hono();

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// eslint-disable-next-line complexity
function parseProfilePayload(payload: unknown): ParseResult<UpdateUserProfileInput> {
  if (typeof payload !== 'object' || payload === null) {
    return err('Invalid profile payload');
  }

  const raw = payload as Partial<Record<keyof UpdateUserProfileInput, unknown>>;
  const firstName = typeof raw.firstName === 'string' ? raw.firstName.trim() : '';
  const lastName = typeof raw.lastName === 'string' ? raw.lastName.trim() : '';
  const email = typeof raw.email === 'string' ? raw.email.toLowerCase().trim() : '';
  const location = typeof raw.location === 'string' ? raw.location.trim() : '';
  const age = parseWholeNumber(raw.age);
  const retirementAge = parseWholeNumber(raw.retirementAge);

  if (!firstName) return err('First name is required');
  if (!lastName) return err('Last name is required');
  if (!email || !EMAIL_PATTERN.test(email)) {
    return err('Enter a valid email address');
  }
  if (age === null || age < MIN_USER_AGE || age > MAX_USER_AGE) {
    return err(`Age must be between ${MIN_USER_AGE} and ${MAX_USER_AGE}`);
  }

  const minRetirementAge = Math.max(age + 1, MIN_RETIREMENT_AGE);
  if (
    retirementAge === null ||
    retirementAge < minRetirementAge ||
    retirementAge > MAX_RETIREMENT_AGE
  ) {
    return err(`Retirement age must be between ${minRetirementAge} and ${MAX_RETIREMENT_AGE}`);
  }

  return ok({
    firstName,
    lastName,
    email,
    location,
    age,
    retirementAge,
  });
}

function parseOptionalPreference<T>(
  value: unknown,
  isValid: (candidate: unknown) => candidate is T,
  error: string,
): ParseResult<T | undefined> {
  if (value === undefined) return ok(undefined);
  return isValid(value) ? ok(value) : err(error);
}

function parsePreferencesPayload(payload: unknown): ParseResult<UpdateUserPreferencesInput> {
  if (typeof payload !== 'object' || payload === null) {
    return err('Invalid preferences payload');
  }

  const raw = payload as Partial<Record<keyof UpdateUserPreferencesInput, unknown>>;
  const currency = parseOptionalPreference(
    raw.baseCurrency,
    isCurrencyCode,
    'Choose a valid base currency',
  );
  if (!currency.ok) return currency;
  const numberFormat = parseOptionalPreference(
    raw.numberFormat,
    isNumberFormatPreference,
    'Choose a valid number format',
  );
  if (!numberFormat.ok) return numberFormat;
  const jurisdiction = parseOptionalPreference(
    raw.jurisdiction,
    isJurisdictionCode,
    'Choose a valid jurisdiction',
  );
  if (!jurisdiction.ok) return jurisdiction;

  const data: UpdateUserPreferencesInput = {
    ...(currency.value ? { baseCurrency: currency.value } : {}),
    ...(numberFormat.value ? { numberFormat: numberFormat.value } : {}),
    ...(jurisdiction.value ? { jurisdiction: jurisdiction.value } : {}),
  };
  if (Object.keys(data).length === 0) {
    return err('Choose at least one preference to update');
  }
  return ok(data);
}

function parsePasswordPayload(payload: unknown): ParseResult<UpdateUserPasswordInput> {
  if (typeof payload !== 'object' || payload === null) {
    return err('Invalid password payload');
  }

  const raw = payload as Partial<Record<keyof UpdateUserPasswordInput, unknown>>;
  const currentPassword = typeof raw.currentPassword === 'string' ? raw.currentPassword : '';
  const nextPassword = typeof raw.nextPassword === 'string' ? raw.nextPassword : '';

  if (!currentPassword) return err('Current password is required');
  if (nextPassword.length < MIN_PASSWORD_LENGTH) {
    return err(`New password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }
  if (currentPassword === nextPassword) {
    return err('New password must be different from your current password');
  }

  return ok({
    currentPassword,
    nextPassword,
  });
}

app.get('/', async (c) => {
  const user = getAuthUser(c);
  const [data] = await db.select(publicUserColumns).from(users).where(eq(users.id, user.id));

  if (!data) {
    return c.json({ error: 'User not found' }, HTTP_STATUS.NOT_FOUND);
  }

  return c.json({ data });
});

app.put('/profile', async (c) => {
  const authUser = getAuthUser(c);
  const body = await readJsonRecord(c.req, 'Invalid request body');
  if (!body.ok) return c.json({ error: body.error }, HTTP_STATUS.BAD_REQUEST);
  const parsed = parseProfilePayload(body.value);

  if (!parsed.ok) {
    return c.json({ error: parsed.error }, HTTP_STATUS.BAD_REQUEST);
  }

  const [existingEmailUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.email, parsed.value.email), ne(users.id, authUser.id)));

  if (existingEmailUser) {
    return c.json({ error: 'An account with this email already exists' }, HTTP_STATUS.CONFLICT);
  }

  const [data] = await db
    .update(users)
    .set({
      firstName: parsed.value.firstName,
      lastName: parsed.value.lastName,
      email: parsed.value.email,
      location: parsed.value.location,
      age: parsed.value.age,
      retirementAge: parsed.value.retirementAge,
    })
    .where(eq(users.id, authUser.id))
    .returning(publicUserColumns);

  if (!data) {
    return c.json({ error: 'User not found' }, HTTP_STATUS.NOT_FOUND);
  }

  return c.json({ data });
});

app.put('/preferences', async (c) => {
  const authUser = getAuthUser(c);
  const body = await readJsonRecord(c.req, 'Invalid request body');
  if (!body.ok) return c.json({ error: body.error }, HTTP_STATUS.BAD_REQUEST);
  const parsed = parsePreferencesPayload(body.value);

  if (!parsed.ok) {
    return c.json({ error: parsed.error }, HTTP_STATUS.BAD_REQUEST);
  }

  const updatePayload: Partial<typeof users.$inferInsert> = {};
  if (parsed.value.baseCurrency) updatePayload.baseCurrency = parsed.value.baseCurrency;
  if (parsed.value.numberFormat) updatePayload.numberFormat = parsed.value.numberFormat;
  if (parsed.value.jurisdiction) updatePayload.jurisdiction = parsed.value.jurisdiction;

  const [data] = await db
    .update(users)
    .set(updatePayload)
    .where(eq(users.id, authUser.id))
    .returning(publicUserColumns);

  if (!data) {
    return c.json({ error: 'User not found' }, HTTP_STATUS.NOT_FOUND);
  }

  return c.json({ data });
});

app.put('/password', changePasswordRateLimit, async (c) => {
  const authUser = getAuthUser(c);
  const currentSessionId = getSessionId(c);
  const body = await readJsonRecord(c.req, 'Invalid request body');
  if (!body.ok) return c.json({ error: body.error }, HTTP_STATUS.BAD_REQUEST);
  const parsed = parsePasswordPayload(body.value);

  if (!parsed.ok) {
    return c.json({ error: parsed.error }, HTTP_STATUS.BAD_REQUEST);
  }

  const [user] = await db
    .select({ id: users.id, passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.id, authUser.id));

  if (!user) {
    return c.json({ error: 'User not found' }, HTTP_STATUS.NOT_FOUND);
  }

  const passwordIsValid = await Bun.password.verify(
    parsed.value.currentPassword,
    user.passwordHash,
  );
  if (!passwordIsValid) {
    return c.json({ error: 'Current password is incorrect' }, HTTP_STATUS.UNAUTHORIZED);
  }

  const passwordHash = await Bun.password.hash(parsed.value.nextPassword, {
    algorithm: 'bcrypt',
    cost: 10,
  });

  const [data] = await db
    .update(users)
    .set({
      passwordHash,
      passwordUpdatedAt: new Date(),
    })
    .where(eq(users.id, authUser.id))
    .returning(publicUserColumns);

  if (!data) {
    return c.json({ error: 'User not found' }, HTTP_STATUS.NOT_FOUND);
  }

  await revokeUserSessions(authUser.id, currentSessionId);

  return c.json({ data });
});

// ── Sessions ────────────────────────────────────────────────────────────────

app.get('/sessions', async (c) => {
  const authUser = getAuthUser(c);
  return c.json({ data: await listUserSessions(authUser.id, getSessionId(c)) });
});

// Signs out every other browser of this account; the current session stays.
app.delete('/sessions', async (c) => {
  const authUser = getAuthUser(c);
  const revoked = await revokeUserSessions(authUser.id, getSessionId(c));
  return c.json({ data: { revoked } });
});

app.delete('/sessions/:id', async (c) => {
  const authUser = getAuthUser(c);
  const removed = await revokeUserSession(authUser.id, c.req.param('id'));
  if (!removed) {
    return c.json({ error: 'Session not found' }, HTTP_STATUS.NOT_FOUND);
  }
  return c.json({ data: null });
});

export default app;
