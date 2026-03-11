import { Hono } from 'hono';
import {
  isNumberFormatPreference,
  isCurrencyCode,
  type UpdateUserPasswordInput,
  type UpdateUserPreferencesInput,
  type UpdateUserProfileInput,
} from '@quro/shared';
import { and, eq, ne } from 'drizzle-orm';
import { db } from '../db/client';
import { users } from '../db/schema';
import { HTTP_STATUS } from '../constants/http';
import { getAuthUser } from '../lib/authUser';
import { publicUserColumns } from '../lib/users';

const app = new Hono();

const MIN_PASSWORD_LENGTH = 8;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type ParseResult<T> = { ok: true; data: T } | { ok: false; error: string };

function parseNumberValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed) ? parsed : null;
  }
  return null;
}

// eslint-disable-next-line complexity
function parseProfilePayload(payload: unknown): ParseResult<UpdateUserProfileInput> {
  if (typeof payload !== 'object' || payload === null) {
    return { ok: false, error: 'Invalid profile payload' };
  }

  const raw = payload as Partial<Record<keyof UpdateUserProfileInput, unknown>>;
  const firstName = typeof raw.firstName === 'string' ? raw.firstName.trim() : '';
  const lastName = typeof raw.lastName === 'string' ? raw.lastName.trim() : '';
  const email = typeof raw.email === 'string' ? raw.email.toLowerCase().trim() : '';
  const location = typeof raw.location === 'string' ? raw.location.trim() : '';
  const age = parseNumberValue(raw.age);
  const retirementAge = parseNumberValue(raw.retirementAge);

  if (!firstName) return { ok: false, error: 'First name is required' };
  if (!lastName) return { ok: false, error: 'Last name is required' };
  if (!email || !EMAIL_PATTERN.test(email)) {
    return { ok: false, error: 'Enter a valid email address' };
  }
  if (age === null || age < 16 || age > 100) {
    return { ok: false, error: 'Age must be between 16 and 100' };
  }
  if (retirementAge === null || retirementAge <= age || retirementAge > 80) {
    return { ok: false, error: `Retirement age must be between ${age + 1} and 80` };
  }

  return {
    ok: true,
    data: {
      firstName,
      lastName,
      email,
      location,
      age,
      retirementAge,
    },
  };
}

function parsePreferencesPayload(payload: unknown): ParseResult<UpdateUserPreferencesInput> {
  if (typeof payload !== 'object' || payload === null) {
    return { ok: false, error: 'Invalid preferences payload' };
  }

  const raw = payload as Partial<Record<keyof UpdateUserPreferencesInput, unknown>>;
  const nextPreferences: UpdateUserPreferencesInput = {};

  if (raw.baseCurrency !== undefined) {
    if (!isCurrencyCode(raw.baseCurrency)) {
      return { ok: false, error: 'Choose a valid base currency' };
    }

    nextPreferences.baseCurrency = raw.baseCurrency;
  }

  if (raw.numberFormat !== undefined) {
    if (!isNumberFormatPreference(raw.numberFormat)) {
      return { ok: false, error: 'Choose a valid number format' };
    }

    nextPreferences.numberFormat = raw.numberFormat;
  }

  if (!nextPreferences.baseCurrency && !nextPreferences.numberFormat) {
    return { ok: false, error: 'Choose at least one preference to update' };
  }

  return {
    ok: true,
    data: nextPreferences,
  };
}

function parsePasswordPayload(payload: unknown): ParseResult<UpdateUserPasswordInput> {
  if (typeof payload !== 'object' || payload === null) {
    return { ok: false, error: 'Invalid password payload' };
  }

  const raw = payload as Partial<Record<keyof UpdateUserPasswordInput, unknown>>;
  const currentPassword = typeof raw.currentPassword === 'string' ? raw.currentPassword : '';
  const nextPassword = typeof raw.nextPassword === 'string' ? raw.nextPassword : '';

  if (!currentPassword) return { ok: false, error: 'Current password is required' };
  if (nextPassword.length < MIN_PASSWORD_LENGTH) {
    return {
      ok: false,
      error: `New password must be at least ${MIN_PASSWORD_LENGTH} characters`,
    };
  }
  if (currentPassword === nextPassword) {
    return { ok: false, error: 'New password must be different from your current password' };
  }

  return {
    ok: true,
    data: {
      currentPassword,
      nextPassword,
    },
  };
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
  const parsed = parseProfilePayload(await c.req.json());

  if (!parsed.ok) {
    return c.json({ error: parsed.error }, HTTP_STATUS.BAD_REQUEST);
  }

  const [existingEmailUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.email, parsed.data.email), ne(users.id, authUser.id)));

  if (existingEmailUser) {
    return c.json({ error: 'An account with this email already exists' }, HTTP_STATUS.CONFLICT);
  }

  const [data] = await db
    .update(users)
    .set({
      firstName: parsed.data.firstName,
      lastName: parsed.data.lastName,
      email: parsed.data.email,
      location: parsed.data.location,
      age: parsed.data.age,
      retirementAge: parsed.data.retirementAge,
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
  const parsed = parsePreferencesPayload(await c.req.json());

  if (!parsed.ok) {
    return c.json({ error: parsed.error }, HTTP_STATUS.BAD_REQUEST);
  }

  const updatePayload: Partial<typeof users.$inferInsert> = {};
  if (parsed.data.baseCurrency) updatePayload.baseCurrency = parsed.data.baseCurrency;
  if (parsed.data.numberFormat) updatePayload.numberFormat = parsed.data.numberFormat;

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

app.put('/password', async (c) => {
  const authUser = getAuthUser(c);
  const parsed = parsePasswordPayload(await c.req.json());

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

  const passwordIsValid = await Bun.password.verify(parsed.data.currentPassword, user.passwordHash);
  if (!passwordIsValid) {
    return c.json({ error: 'Current password is incorrect' }, HTTP_STATUS.UNAUTHORIZED);
  }

  const passwordHash = await Bun.password.hash(parsed.data.nextPassword, {
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

  return c.json({ data });
});

export default app;
