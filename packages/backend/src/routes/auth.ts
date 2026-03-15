import { Hono, type Context } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { db } from '../db/client';
import { users, sessions } from '../db/schema';
import { eq } from 'drizzle-orm';
import { HTTP_STATUS } from '../constants/http';
import { signinRateLimit, signupRateLimit } from '../middleware/rateLimit';
import {
  DEFAULT_BASE_CURRENCY,
  DEFAULT_USER_NUMBER_FORMAT,
  DEFAULT_RETIREMENT_AGE,
  DEFAULT_USER_AGE,
  publicUserColumns,
} from '../lib/users';

const app = new Hono();

const SESSION_ID_BYTES = 32;
const HEX_RADIX = 16;
const HEX_BYTE_LENGTH = 2;
const MIN_PASSWORD_LENGTH = 8;
const SESSION_DURATION_DAYS = 30;
const HOURS_PER_DAY = 24;
const MINUTES_PER_HOUR = 60;
const SECONDS_PER_MINUTE = 60;
const MILLISECONDS_PER_SECOND = 1000;

type SignUpPayload = {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  age: number | null;
  retirementAge: number | null;
};

type ValidSignUpPayload = {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  age: number;
  retirementAge: number;
};

function generateSessionId() {
  const bytes = crypto.getRandomValues(new Uint8Array(SESSION_ID_BYTES));
  return Array.from(bytes, (b) => b.toString(HEX_RADIX).padStart(HEX_BYTE_LENGTH, '0')).join('');
}

function normalizeString(rawValue: unknown, lowercase = false) {
  if (typeof rawValue !== 'string') {
    return '';
  }

  const normalized = rawValue.trim();
  return lowercase ? normalized.toLowerCase() : normalized;
}

function parseOptionalWholeNumber(rawValue: unknown, fallback: number) {
  if (rawValue === undefined || rawValue === null || rawValue === '') {
    return fallback;
  }

  const normalized =
    typeof rawValue === 'string'
      ? Number(rawValue.trim())
      : typeof rawValue === 'number'
        ? rawValue
        : Number.NaN;

  return Number.isInteger(normalized) && normalized > 0 ? normalized : null;
}

const SESSION_MAX_AGE =
  SESSION_DURATION_DAYS *
  HOURS_PER_DAY *
  MINUTES_PER_HOUR *
  SECONDS_PER_MINUTE *
  MILLISECONDS_PER_SECOND;

function parseSignUpPayload(rawBody: Record<string, unknown>): SignUpPayload {
  return {
    firstName: normalizeString(rawBody.firstName),
    lastName: normalizeString(rawBody.lastName),
    email: normalizeString(rawBody.email, true),
    password: typeof rawBody.password === 'string' ? rawBody.password : '',
    age: parseOptionalWholeNumber(rawBody.age, DEFAULT_USER_AGE),
    retirementAge: parseOptionalWholeNumber(rawBody.retirementAge, DEFAULT_RETIREMENT_AGE),
  };
}

function validateSignUpPayload(
  payload: SignUpPayload,
): { error: string } | { data: ValidSignUpPayload } {
  if (!payload.firstName || !payload.lastName || !payload.email || !payload.password) {
    return { error: 'First name, last name, email, and password are required' };
  }

  if (payload.password.length < MIN_PASSWORD_LENGTH) {
    return { error: 'Password must be at least 8 characters' };
  }

  if (payload.age === null || payload.retirementAge === null) {
    return { error: 'Age values must be whole numbers' };
  }

  if (payload.retirementAge <= payload.age) {
    return { error: 'Retirement age must be greater than current age' };
  }

  return {
    data: {
      firstName: payload.firstName,
      lastName: payload.lastName,
      email: payload.email,
      password: payload.password,
      age: payload.age,
      retirementAge: payload.retirementAge,
    },
  };
}

async function createSession(c: Context, userId: number) {
  const sessionId = generateSessionId();
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE);

  await db.insert(sessions).values({ id: sessionId, userId, expiresAt });

  setCookie(c, 'session', sessionId, {
    httpOnly: true,
    secure: process.env.SECURE_COOKIES === 'true',
    sameSite: 'Lax',
    path: '/',
    maxAge: SESSION_MAX_AGE / 1000,
  });
}

// ── Sign Up ─────────────────────────────────────────────────────────────────

app.post('/signup', signupRateLimit, async (c) => {
  const rawBody = (await c.req.json()) as Record<string, unknown>;
  const validationResult = validateSignUpPayload(parseSignUpPayload(rawBody));

  if ('error' in validationResult) {
    return c.json({ error: validationResult.error }, HTTP_STATUS.BAD_REQUEST);
  }

  const { data } = validationResult;
  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, data.email));
  if (existing.length > 0) {
    return c.json({ error: 'An account with this email already exists' }, HTTP_STATUS.CONFLICT);
  }

  const passwordHash = await Bun.password.hash(data.password, { algorithm: 'bcrypt', cost: 10 });

  const [user] = await db
    .insert(users)
    .values({
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email,
      location: '',
      age: data.age,
      retirementAge: data.retirementAge,
      baseCurrency: DEFAULT_BASE_CURRENCY,
      numberFormat: DEFAULT_USER_NUMBER_FORMAT,
      passwordHash,
    })
    .returning(publicUserColumns);

  await createSession(c, user.id);

  return c.json({ data: user }, HTTP_STATUS.CREATED);
});

// ── Sign In ─────────────────────────────────────────────────────────────────

app.post('/signin', signinRateLimit, async (c) => {
  const { email: rawEmail, password: rawPassword } = await c.req.json();
  const email = typeof rawEmail === 'string' ? rawEmail.toLowerCase().trim() : '';
  const password = typeof rawPassword === 'string' ? rawPassword : '';

  if (!email || !password) {
    return c.json({ error: 'Email and password are required' }, HTTP_STATUS.BAD_REQUEST);
  }

  const [user] = await db.select().from(users).where(eq(users.email, email));
  if (!user) {
    return c.json({ error: 'Invalid email or password' }, HTTP_STATUS.UNAUTHORIZED);
  }

  const valid = await Bun.password.verify(password, user.passwordHash);
  if (!valid) {
    return c.json({ error: 'Invalid email or password' }, HTTP_STATUS.UNAUTHORIZED);
  }

  const sessionId = generateSessionId();
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE);
  await db.insert(sessions).values({ id: sessionId, userId: user.id, expiresAt });

  setCookie(c, 'session', sessionId, {
    httpOnly: true,
    secure: process.env.SECURE_COOKIES === 'true',
    sameSite: 'Lax',
    path: '/',
    maxAge: SESSION_MAX_AGE / 1000,
  });

  const [publicUser] = await db.select(publicUserColumns).from(users).where(eq(users.id, user.id));
  return c.json({ data: publicUser });
});

// ── Get current user ────────────────────────────────────────────────────────

app.get('/me', async (c) => {
  const sessionId = getCookie(c, 'session');
  if (!sessionId) {
    return c.json({ data: null });
  }

  const [session] = await db.select().from(sessions).where(eq(sessions.id, sessionId));
  if (!session || session.expiresAt < new Date()) {
    deleteCookie(c, 'session', { path: '/' });
    return c.json({ data: null });
  }

  const [user] = await db.select(publicUserColumns).from(users).where(eq(users.id, session.userId));

  if (!user) {
    return c.json({ data: null });
  }

  return c.json({ data: user });
});

// ── Sign Out ────────────────────────────────────────────────────────────────

app.post('/signout', async (c) => {
  const sessionId = getCookie(c, 'session');
  if (sessionId) {
    await db.delete(sessions).where(eq(sessions.id, sessionId));
    deleteCookie(c, 'session', { path: '/' });
  }
  return c.json({ ok: true });
});

export default app;
