import { Hono } from 'hono';
import {
  MAX_RETIREMENT_AGE,
  MAX_USER_AGE,
  MIN_PASSWORD_LENGTH,
  MIN_RETIREMENT_AGE,
  MIN_USER_AGE,
} from '@quro/shared';
import { db } from '../db/client';
import { users, sessions } from '../db/schema';
import { eq } from 'drizzle-orm';
import { HTTP_STATUS } from '../constants/http';
import {
  passwordResetRateLimit,
  signinEmailRateLimit,
  signinRateLimit,
  signupRateLimit,
} from '../middleware/rateLimit';
import {
  DEFAULT_BASE_CURRENCY,
  DEFAULT_USER_NUMBER_FORMAT,
  DEFAULT_RETIREMENT_AGE,
  DEFAULT_USER_AGE,
  publicUserColumns,
} from '../lib/users';
import { parseWholeNumber, readJsonRecord } from '../lib/requestValidation';
import { consumeAuthCode } from '../lib/authCodes';
import { cookieTransportCheck } from '../middleware/cookieTransport';
import {
  getRegistrationMode,
  getRegistrationPolicy,
  registerAccount,
  type RegistrationRejection,
} from '../lib/registration';
import {
  clearSessionCookies,
  createSession,
  getSessionCookieHash,
  revokeUserSessions,
} from '../lib/sessions';

const app = new Hono();

app.use('*', cookieTransportCheck);

const BCRYPT_COST = 10;
const DUMMY_PASSWORD_HASH = await Bun.password.hash('quro-dummy-password', {
  algorithm: 'bcrypt',
  cost: BCRYPT_COST,
});

type SignUpPayload = {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  age: number | null;
  retirementAge: number | null;
  inviteCode: string | null;
};

type ValidSignUpPayload = {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  age: number;
  retirementAge: number;
  inviteCode: string | null;
};

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

  const parsed = parseWholeNumber(rawValue);
  return parsed !== null && parsed > 0 ? parsed : null;
}

function parseSignUpPayload(rawBody: Record<string, unknown>): SignUpPayload {
  return {
    firstName: normalizeString(rawBody.firstName),
    lastName: normalizeString(rawBody.lastName),
    email: normalizeString(rawBody.email, true),
    password: typeof rawBody.password === 'string' ? rawBody.password : '',
    age: parseOptionalWholeNumber(rawBody.age, DEFAULT_USER_AGE),
    retirementAge: parseOptionalWholeNumber(rawBody.retirementAge, DEFAULT_RETIREMENT_AGE),
    inviteCode: normalizeString(rawBody.inviteCode) || null,
  };
}

function getRequiredSignupError(payload: SignUpPayload): string | null {
  return !payload.firstName || !payload.lastName || !payload.email || !payload.password
    ? 'First name, last name, email, and password are required'
    : null;
}

function getPasswordError(password: string): string | null {
  return password.length < MIN_PASSWORD_LENGTH
    ? `Password must be at least ${MIN_PASSWORD_LENGTH} characters`
    : null;
}

function getSignupAgeError(age: number | null): string | null {
  return age === null || age < MIN_USER_AGE || age > MAX_USER_AGE
    ? `Age must be between ${MIN_USER_AGE} and ${MAX_USER_AGE}`
    : null;
}

function getSignupRetirementAgeError(
  retirementAge: number | null,
  age: number | null,
): string | null {
  if (
    retirementAge === null ||
    retirementAge < MIN_RETIREMENT_AGE ||
    retirementAge > MAX_RETIREMENT_AGE
  ) {
    return `Retirement age must be between ${MIN_RETIREMENT_AGE} and ${MAX_RETIREMENT_AGE}`;
  }

  return age !== null && retirementAge <= age
    ? 'Retirement age must be greater than current age'
    : null;
}

function validateSignUpPayload(
  payload: SignUpPayload,
): { error: string } | { data: ValidSignUpPayload } {
  const error =
    getRequiredSignupError(payload) ??
    getPasswordError(payload.password) ??
    getSignupAgeError(payload.age) ??
    getSignupRetirementAgeError(payload.retirementAge, payload.age);

  if (error) return { error };

  return {
    data: {
      firstName: payload.firstName,
      lastName: payload.lastName,
      email: payload.email,
      password: payload.password,
      age: payload.age!,
      retirementAge: payload.retirementAge!,
      inviteCode: payload.inviteCode,
    },
  };
}

const REGISTRATION_ERRORS = {
  closed: {
    status: HTTP_STATUS.FORBIDDEN,
    error: 'Registration is closed on this Quro instance. Ask its operator for an account.',
  },
  code_required: {
    status: HTTP_STATUS.FORBIDDEN,
    error: 'An invite code from the operator of this Quro instance is required',
  },
  invalid_code: {
    status: HTTP_STATUS.FORBIDDEN,
    error: 'This code is invalid, expired or already used',
  },
  email_taken: {
    status: HTTP_STATUS.CONFLICT,
    error: 'An account with this email already exists',
  },
} as const satisfies Record<RegistrationRejection, { status: number; error: string }>;

const SETUP_CODE_REQUIRED_ERROR =
  'A setup code is required to create the first account. The operator issues one with `quro user invite` on the server.';

function registrationError(reason: RegistrationRejection, firstAccount: boolean) {
  const { status, error } = REGISTRATION_ERRORS[reason];
  return {
    status,
    error: reason === 'code_required' && firstAccount ? SETUP_CODE_REQUIRED_ERROR : error,
  };
}

// ── Registration policy ─────────────────────────────────────────────────────

app.get('/registration', async (c) => c.json({ data: await getRegistrationPolicy() }));

// ── Sign Up ─────────────────────────────────────────────────────────────────

app.post('/signup', signupRateLimit, async (c) => {
  const body = await readJsonRecord(c.req, 'Invalid request body');
  if (!body.ok) return c.json({ error: body.error }, HTTP_STATUS.BAD_REQUEST);
  const rawBody = body.value;
  const validationResult = validateSignUpPayload(parseSignUpPayload(rawBody));

  if ('error' in validationResult) {
    return c.json({ error: validationResult.error }, HTTP_STATUS.BAD_REQUEST);
  }

  const { data } = validationResult;
  const passwordHash = await Bun.password.hash(data.password, {
    algorithm: 'bcrypt',
    cost: BCRYPT_COST,
  });

  const result = await registerAccount({
    mode: getRegistrationMode(),
    code: data.inviteCode,
    user: {
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email,
      location: '',
      age: data.age,
      retirementAge: data.retirementAge,
      baseCurrency: DEFAULT_BASE_CURRENCY,
      numberFormat: DEFAULT_USER_NUMBER_FORMAT,
      passwordHash,
    },
  });

  if (!result.ok) {
    const { status, error } = registrationError(result.reason, result.firstAccount);
    return c.json({ error }, status);
  }

  const { user } = result;
  await createSession(c, user.id);

  return c.json({ data: user }, HTTP_STATUS.CREATED);
});

// ── Sign In ─────────────────────────────────────────────────────────────────

function parseSigninCredentials(body: Record<string, unknown>) {
  const { email, password } = body;
  return {
    email: typeof email === 'string' ? email.toLowerCase().trim() : '',
    password: typeof password === 'string' ? password : '',
  };
}

app.post('/signin', signinRateLimit, async (c) => {
  const body = await readJsonRecord(c.req, 'Invalid request body');
  if (!body.ok) return c.json({ error: body.error }, HTTP_STATUS.BAD_REQUEST);
  const { email, password } = parseSigninCredentials(body.value);

  if (!email || !password) {
    return c.json({ error: 'Email and password are required' }, HTTP_STATUS.BAD_REQUEST);
  }

  // Every attempt holds a place in the account's budget while it runs, so concurrent guesses
  // cannot exceed it. Unknown emails take the same path and keep their attempt.
  const attempt = signinEmailRateLimit.reserve(email);
  if (!attempt) {
    return c.json(
      { error: 'Too many requests, please try again later' },
      HTTP_STATUS.TOO_MANY_REQUESTS,
    );
  }

  const [user] = await db
    .select({ id: users.id, passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.email, email));

  const hashToVerify = user?.passwordHash ?? DUMMY_PASSWORD_HASH;
  const valid = await Bun.password.verify(password, hashToVerify);

  if (!user || !valid) {
    return c.json({ error: 'Invalid email or password' }, HTTP_STATUS.UNAUTHORIZED);
  }

  // Only failed attempts count toward the account's budget; earlier failures stay counted. The
  // credentials were right, so the attempt is refunded even if creating the session fails below.
  attempt.refund();
  await createSession(c, user.id);

  const [publicUser] = await db.select(publicUserColumns).from(users).where(eq(users.id, user.id));
  return c.json({ data: publicUser });
});

// ── Password reset (operator-issued code) ──────────────────────────────────

function parsePasswordResetPayload(body: Record<string, unknown>) {
  const code = typeof body.code === 'string' ? body.code.trim() : '';
  const nextPassword = typeof body.nextPassword === 'string' ? body.nextPassword : '';
  if (!code) return { error: 'Recovery code is required' } as const;
  const passwordError = getPasswordError(nextPassword);
  if (passwordError) return { error: passwordError } as const;
  return { code, nextPassword } as const;
}

// Without SMTP, recovery goes through the operator: `quro user reset-password <email>` prints a
// one-time code that the user redeems here. Every existing session of the account is revoked.
app.post('/password-reset', passwordResetRateLimit, async (c) => {
  const body = await readJsonRecord(c.req, 'Invalid request body');
  if (!body.ok) return c.json({ error: body.error }, HTTP_STATUS.BAD_REQUEST);
  const payload = parsePasswordResetPayload(body.value);
  if ('error' in payload) return c.json({ error: payload.error }, HTTP_STATUS.BAD_REQUEST);

  const passwordHash = await Bun.password.hash(payload.nextPassword, {
    algorithm: 'bcrypt',
    cost: BCRYPT_COST,
  });

  const userId = await db.transaction(async (tx) => {
    const consumed = await consumeAuthCode(tx, payload.code, 'password_reset');
    if (!consumed?.userId) return null;
    await tx
      .update(users)
      .set({ passwordHash, passwordUpdatedAt: new Date() })
      .where(eq(users.id, consumed.userId));
    await revokeUserSessions(consumed.userId, null, tx);
    return consumed.userId;
  });

  if (userId === null) {
    return c.json(
      { error: 'This recovery code is invalid, expired or already used' },
      HTTP_STATUS.BAD_REQUEST,
    );
  }

  await createSession(c, userId);
  const [publicUser] = await db.select(publicUserColumns).from(users).where(eq(users.id, userId));
  return c.json({ data: publicUser });
});

// ── Get current user ────────────────────────────────────────────────────────

app.get('/me', async (c) => {
  const sessionId = getSessionCookieHash(c);
  if (!sessionId) {
    return c.json({ data: null });
  }

  const [session] = await db.select().from(sessions).where(eq(sessions.id, sessionId));
  if (!session || session.expiresAt < new Date()) {
    clearSessionCookies(c);
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
  const sessionId = getSessionCookieHash(c);
  if (sessionId) {
    await db.delete(sessions).where(eq(sessions.id, sessionId));
    clearSessionCookies(c);
  }
  return c.json({ ok: true });
});

export default app;
