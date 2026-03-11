import { like, inArray } from 'drizzle-orm';
import { app } from '../index';
import { db } from '../db/client';
import {
  budgetCategories,
  budgetTransactions,
  goals,
  savingsAccounts,
  savingsTransactions,
  sessions,
  users,
} from '../db/schema';

type RequestOptions = {
  method?: string;
  json?: unknown;
  headers?: HeadersInit;
  cookie?: string | null;
};

type SignUpOverrides = Partial<{
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  age: number;
  retirementAge: number;
}>;

export type AuthSession = {
  cookie: string;
  user: {
    id: number;
    email: string;
  };
};

const DEFAULT_PASSWORD = 'strongpass123';
const DEFAULT_USER_AGE = 32;
const DEFAULT_RETIREMENT_AGE = 67;

function createRequestFunction() {
  return (path: string, options: RequestOptions = {}) => {
    const headers = new Headers(options.headers);

    if (options.cookie) {
      headers.set('Cookie', options.cookie);
    }

    let body: BodyInit | undefined;
    if (options.json !== undefined) {
      headers.set('Content-Type', 'application/json');
      body = JSON.stringify(options.json);
    }

    return app.request(path, {
      method: options.method ?? 'GET',
      headers,
      body,
    });
  };
}

function buildEmail(label: string, emailDomain: string) {
  return `${label}-${crypto.randomUUID().toLowerCase()}@${emailDomain}`;
}

function extractCookie(response: Response) {
  const setCookie = response.headers.get('set-cookie');
  return setCookie ? setCookie.split(';', 1)[0] : null;
}

async function parseAuthSessionResponse(response: Response, email: string): Promise<AuthSession> {
  const body = (await response.json()) as {
    data?: {
      id: number;
      email: string;
    };
    error?: string;
  };

  if (!response.ok || !body.data) {
    throw new Error(body.error ?? `Expected auth to succeed for ${email}`);
  }

  const cookie = extractCookie(response);
  if (!cookie) {
    throw new Error(`Expected auth to set a session cookie for ${email}`);
  }

  return {
    cookie,
    user: {
      id: body.data.id,
      email: body.data.email,
    },
  };
}

function createSignUpPayload(email: string, overrides: SignUpOverrides) {
  return {
    firstName: overrides.firstName ?? 'Integration',
    lastName: overrides.lastName ?? 'Tester',
    email,
    password: overrides.password ?? DEFAULT_PASSWORD,
    age: overrides.age ?? DEFAULT_USER_AGE,
    retirementAge: overrides.retirementAge ?? DEFAULT_RETIREMENT_AGE,
  };
}

async function cleanupTestUsers(emailPattern: string) {
  const testUsers = await db
    .select({ id: users.id })
    .from(users)
    .where(like(users.email, emailPattern));

  const userIds = testUsers.map((user) => user.id);
  if (userIds.length === 0) {
    return;
  }

  await db.delete(savingsTransactions).where(inArray(savingsTransactions.userId, userIds));
  await db.delete(savingsAccounts).where(inArray(savingsAccounts.userId, userIds));
  await db.delete(budgetTransactions).where(inArray(budgetTransactions.userId, userIds));
  await db.delete(budgetCategories).where(inArray(budgetCategories.userId, userIds));
  await db.delete(goals).where(inArray(goals.userId, userIds));
  await db.delete(sessions).where(inArray(sessions.userId, userIds));
  await db.delete(users).where(inArray(users.id, userIds));
}

export function createIntegrationHelpers(emailDomain: string) {
  const emailPattern = `%@${emailDomain}`;
  const request = createRequestFunction();
  const buildScopedEmail = (label: string) => buildEmail(label, emailDomain);

  const signUp = async (label: string, overrides: SignUpOverrides = {}): Promise<AuthSession> => {
    const email = overrides.email ?? buildScopedEmail(label);
    const response = await request('/api/auth/signup', {
      method: 'POST',
      json: createSignUpPayload(email, overrides),
    });

    return parseAuthSessionResponse(response, email);
  };

  const signIn = async (email: string, password = DEFAULT_PASSWORD): Promise<AuthSession> => {
    const response = await request('/api/auth/signin', {
      method: 'POST',
      json: { email, password },
    });

    return parseAuthSessionResponse(response, email);
  };

  return {
    cleanup: () => cleanupTestUsers(emailPattern),
    buildEmail: buildScopedEmail,
    request,
    signIn,
    signUp,
  };
}

export const integrationPassword = DEFAULT_PASSWORD;
