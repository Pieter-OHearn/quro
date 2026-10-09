import { like, inArray, or } from 'drizzle-orm';
import { createApp } from '../app';
import { applyTestSettings, documentAndImportSettings } from './config';
import { db } from '../db/client';
import { peerEnv } from './peer';
import { issueRegistrationCode } from '../lib/authCodes';
import { HOUR_MS } from '../constants/time';
import {
  authCodes,
  budgetCategories,
  budgetTransactions,
  categoryMappings,
  debtPayments,
  debts,
  goals,
  holdingPriceHistory,
  holdingTransactions,
  holdings,
  mortgageTransactions,
  mortgages,
  partnerLinkMembers,
  partnerLinks,
  payslips,
  pensionPots,
  pensionTransactions,
  properties,
  propertyTransactions,
  savingsAccounts,
  savingsTransactions,
  sessions,
  users,
} from '../db/schema';

// A fixed, documentation-range peer: rate limiting is off under NODE_ENV=test, so one is enough.
const DEFAULT_PEER_ADDRESS = '203.0.113.1';

type RequestOptions = {
  method?: string;
  body?: BodyInit;
  json?: unknown;
  headers?: HeadersInit;
  cookie?: string | null;
  remoteAddress?: string;
};

type SignUpOverrides = Partial<{
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  age: number;
  retirementAge: number;
  inviteCode: string;
}>;

export type AuthSession = {
  cookie: string;
  csrfToken: string;
  user: {
    id: number;
    email: string;
  };
};

const DEFAULT_PASSWORD = 'strongpass123';
const DEFAULT_USER_AGE = 32;
const DEFAULT_RETIREMENT_AGE = 67;

// Optional services are on by default in integration tests (their clients are mocked); tests of an
// unconfigured instance turn them off with `applyTestSettings`.
applyTestSettings(documentAndImportSettings());

function createRequestFunction() {
  return (path: string, options: RequestOptions = {}) => {
    const headers = new Headers(options.headers);

    if (options.cookie) {
      headers.set('Cookie', options.cookie);
      const csrfMatch = options.cookie.match(/csrf_token=([^;]+)/);
      const method = (options.method ?? 'GET').toUpperCase();
      if (csrfMatch && !['GET', 'HEAD', 'OPTIONS'].includes(method)) {
        headers.set('X-CSRF-Token', csrfMatch[1]);
      }
    }

    let body: BodyInit | undefined;
    if (options.json !== undefined) {
      headers.set('Content-Type', 'application/json');
      body = JSON.stringify(options.json);
    } else if (options.body !== undefined) {
      body = options.body;
    }

    // Built per request from the current configuration, so a test that changes settings sees
    // exactly the routes that configuration mounts.
    return createApp().request(
      path,
      {
        method: options.method ?? 'GET',
        headers,
        body,
      },
      peerEnv(options.remoteAddress ?? DEFAULT_PEER_ADDRESS),
    );
  };
}

function buildEmail(label: string, emailDomain: string) {
  return `${label}-${crypto.randomUUID().toLowerCase()}@${emailDomain}`;
}

function extractSessionCookies(response: Response): {
  cookie: string | null;
  csrfToken: string | null;
} {
  const setCookie = response.headers.get('set-cookie');
  if (!setCookie) return { cookie: null, csrfToken: null };

  const sessionMatch = setCookie.match(/(?:^|,\s*)session=([^;]+)/);
  const csrfMatch = setCookie.match(/csrf_token=([^;,]+)/);

  const sessionCookie = sessionMatch ? `session=${sessionMatch[1]}` : null;
  const csrfToken = csrfMatch?.[1] ?? null;
  const cookie =
    sessionCookie && csrfToken ? `${sessionCookie}; csrf_token=${csrfToken}` : sessionCookie;

  return { cookie, csrfToken };
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

  const { cookie, csrfToken } = extractSessionCookies(response);
  if (!cookie) {
    throw new Error(`Expected auth to set a session cookie for ${email}`);
  }
  if (!csrfToken) {
    throw new Error(`Expected auth to set a CSRF token cookie for ${email}`);
  }

  return {
    cookie,
    csrfToken,
    user: {
      id: body.data.id,
      email: body.data.email,
    },
  };
}

function createSignUpPayload(email: string, overrides: SignUpOverrides, inviteCode: string) {
  return {
    firstName: overrides.firstName ?? 'Integration',
    lastName: overrides.lastName ?? 'Tester',
    email,
    password: overrides.password ?? DEFAULT_PASSWORD,
    age: overrides.age ?? DEFAULT_USER_AGE,
    retirementAge: overrides.retirementAge ?? DEFAULT_RETIREMENT_AGE,
    inviteCode,
  };
}

// Codes issued for tests, removed by cleanup whether or not a sign-up used them.
const issuedInviteCodeIds = new Set<number>();

// Registration is invite-only by default, so tests sign up the way an invited user does.
export async function issueInviteCode(): Promise<string> {
  const issued = await issueRegistrationCode({ ttlMs: HOUR_MS });
  issuedInviteCodeIds.add(issued.id);
  return issued.code;
}

async function cleanupInviteCodes() {
  if (issuedInviteCodeIds.size === 0) return;
  await db.delete(authCodes).where(inArray(authCodes.id, [...issuedInviteCodeIds]));
  issuedInviteCodeIds.clear();
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
  await db.delete(holdingPriceHistory).where(inArray(holdingPriceHistory.userId, userIds));
  await db.delete(holdingTransactions).where(inArray(holdingTransactions.userId, userIds));
  await db.delete(propertyTransactions).where(inArray(propertyTransactions.userId, userIds));
  await db.delete(mortgageTransactions).where(inArray(mortgageTransactions.userId, userIds));
  await db.delete(pensionTransactions).where(inArray(pensionTransactions.userId, userIds));
  await db.delete(payslips).where(inArray(payslips.userId, userIds));
  await db.delete(mortgages).where(inArray(mortgages.userId, userIds));
  await db.delete(properties).where(inArray(properties.userId, userIds));
  await db.delete(holdings).where(inArray(holdings.userId, userIds));
  await db.delete(pensionPots).where(inArray(pensionPots.userId, userIds));
  await db.delete(budgetTransactions).where(inArray(budgetTransactions.userId, userIds));
  await db.delete(budgetCategories).where(inArray(budgetCategories.userId, userIds));
  await db.delete(categoryMappings).where(inArray(categoryMappings.userId, userIds));
  await db.delete(goals).where(inArray(goals.userId, userIds));
  await db.delete(debtPayments).where(inArray(debtPayments.userId, userIds));
  await db.delete(debts).where(inArray(debts.userId, userIds));
  await db
    .delete(partnerLinks)
    .where(
      or(inArray(partnerLinks.requesterId, userIds), inArray(partnerLinks.addresseeId, userIds)),
    );
  await db.delete(sessions).where(inArray(sessions.userId, userIds));
  await db.delete(authCodes).where(inArray(authCodes.consumedByUserId, userIds));
  await db.delete(users).where(inArray(users.id, userIds));
}

export function insertPartnerLink(
  requesterId: number,
  addresseeId: number,
  status: 'pending' | 'accepted' = 'pending',
) {
  return db.transaction(async (tx) => {
    const [link] = await tx
      .insert(partnerLinks)
      .values({ requesterId, addresseeId, status })
      .returning();
    await tx.insert(partnerLinkMembers).values([
      { userId: requesterId, linkId: link.id },
      { userId: addresseeId, linkId: link.id },
    ]);
    return link;
  });
}

export function createIntegrationHelpers(emailDomain: string) {
  const emailPattern = `%@${emailDomain}`;
  const request = createRequestFunction();
  const buildScopedEmail = (label: string) => buildEmail(label, emailDomain);

  const signUp = async (label: string, overrides: SignUpOverrides = {}): Promise<AuthSession> => {
    const email = overrides.email ?? buildScopedEmail(label);
    const inviteCode = overrides.inviteCode ?? (await issueInviteCode());
    const response = await request('/api/auth/signup', {
      method: 'POST',
      json: createSignUpPayload(email, overrides, inviteCode),
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
    cleanup: async () => {
      await cleanupInviteCodes();
      await cleanupTestUsers(emailPattern);
    },
    buildEmail: buildScopedEmail,
    issueInviteCode,
    request,
    signIn,
    signUp,
  };
}

export function randomTestIp(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(3));
  return `203.${bytes[0]}.${bytes[1]}.${bytes[2]}`;
}

export const integrationPassword = DEFAULT_PASSWORD;
