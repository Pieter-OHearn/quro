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
  TEXT_FIELD_LIMITS,
} from '@quro/shared';
import { and, eq, gt, ne } from 'drizzle-orm';
import { db } from '../db/client';
import { sessions, users } from '../db/schema';
import { HTTP_STATUS } from '../constants/http';
import { getAuthUser, getSessionId } from '../lib/authUser';
import { publicUserColumns } from '../lib/users';
import {
  clearSessionCookies,
  listUserSessions,
  revokeUserSession,
  revokeUserSessions,
} from '../lib/sessions';
import { deleteAccount, previewAccountDeletion } from '../lib/accountDeletion';
import { ExportLimitError, exportStream, prepareExport } from '../lib/dataExport';
import { getBuildInfo } from '../lib/buildInfo';
import { getDocumentStore } from '../lib/documentStorage';
import { changePasswordRateLimit } from '../middleware/rateLimit';
import {
  err,
  ok,
  parseWholeNumber,
  readJsonRecord,
  checkTextLimits,
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
  const lengths = await checkTextLimits(parsed.value, TEXT_FIELD_LIMITS.profile, async () => {
    const [current] = await db.select().from(users).where(eq(users.id, authUser.id));
    return current;
  });
  if (!lengths.ok) return c.json({ error: lengths.error }, HTTP_STATUS.BAD_REQUEST);

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

  // The new password and the sign-out of every other browser take effect together.
  const data = await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(users)
      .set({
        passwordHash,
        passwordUpdatedAt: new Date(),
      })
      .where(eq(users.id, authUser.id))
      .returning(publicUserColumns);
    if (updated) await revokeUserSessions(authUser.id, currentSessionId, tx);
    return updated;
  });

  if (!data) {
    return c.json({ error: 'User not found' }, HTTP_STATUS.NOT_FOUND);
  }

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

// ── Data export and account deletion ────────────────────────────────────────

const MAX_CONCURRENT_EXPORTS = 2;
const activeExports = new Set<number>();

async function sessionStillValid(userId: number, sessionId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: sessions.id })
    .from(sessions)
    .where(
      and(
        eq(sessions.id, sessionId),
        eq(sessions.userId, userId),
        gt(sessions.expiresAt, new Date()),
      ),
    )
    .limit(1);
  return Boolean(row);
}

// One ZIP with the account's own data as JSON and CSV, its documents and a manifest. Only the
// caller's rows are read (see lib/accountData.ts), and the session is checked again before each
// document, so signing out elsewhere or deleting the account stops a running export.
app.get('/export', async (c) => {
  const authUser = getAuthUser(c);
  const sessionId = getSessionId(c);
  if (activeExports.has(authUser.id) || activeExports.size >= MAX_CONCURRENT_EXPORTS) {
    return c.json(
      { error: 'An export is already running. Try again shortly.' },
      HTTP_STATUS.TOO_MANY_REQUESTS,
    );
  }
  activeExports.add(authUser.id);
  const release = () => activeExports.delete(authUser.id);
  try {
    const prepared = await prepareExport(authUser.id);
    const stream = exportStream(prepared, {
      store: getDocumentStore(),
      quroVersion: getBuildInfo().version,
      stillAllowed: () => sessionStillValid(authUser.id, sessionId),
      onClose: release,
    });
    const stamp = prepared.exportedAt.toISOString().slice(0, 10);
    return new Response(stream, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="quro-export-${stamp}.zip"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    release();
    if (error instanceof ExportLimitError) {
      return c.json({ error: error.message }, HTTP_STATUS.PAYLOAD_TOO_LARGE);
    }
    throw error;
  }
});

// What deleting the account would remove, for the confirmation dialog.
app.get('/account', async (c) => {
  return c.json({ data: await previewAccountDeletion(getAuthUser(c).id) });
});

// Deletes the account and everything it owns. The caller proves it is them with the password and
// the account email.
app.delete('/account', changePasswordRateLimit, async (c) => {
  const authUser = getAuthUser(c);
  const body = await readJsonRecord(c.req, 'Invalid request body');
  if (!body.ok) return c.json({ error: body.error }, HTTP_STATUS.BAD_REQUEST);
  const { password, confirmEmail } = body.value;
  if (typeof password !== 'string' || typeof confirmEmail !== 'string') {
    return c.json(
      { error: 'Password and email confirmation are required' },
      HTTP_STATUS.BAD_REQUEST,
    );
  }
  const [user] = await db
    .select({ email: users.email, passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.id, authUser.id));
  if (!user) return c.json({ error: 'User not found' }, HTTP_STATUS.NOT_FOUND);
  if (confirmEmail.toLowerCase().trim() !== user.email) {
    return c.json({ error: 'Type your email address to confirm' }, HTTP_STATUS.BAD_REQUEST);
  }
  if (!(await Bun.password.verify(password, user.passwordHash))) {
    return c.json({ error: 'Password is incorrect' }, HTTP_STATUS.UNAUTHORIZED);
  }
  const result = await deleteAccount(authUser.id);
  clearSessionCookies(c);
  return c.json({ data: result });
});

export default app;
