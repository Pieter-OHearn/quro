import { createHash } from 'node:crypto';
import { and, eq, gt, lt } from 'drizzle-orm';
import { db } from '../db/client';
import { oidcIdentities, oidcLoginAttempts, users } from '../db/schema';
import { MINUTE_MS } from '../constants/time';
import {
  OidcError,
  buildAuthorizationUrl,
  discoverEndpoints,
  exchangeCode,
  fetchIdentity,
  randomUrlToken,
  safeEqual,
  verifyIdToken,
  type OidcClientSettings,
} from './oidcClient';
import { getRegistrationMode } from './registration';
import { isUniqueViolation } from './postgresErrors';
import { revokeUserSessions } from './sessions';

const LOGIN_ATTEMPT_TTL_MINUTES = 10;
export const LOGIN_ATTEMPT_TTL_MS = LOGIN_ATTEMPT_TTL_MINUTES * MINUTE_MS;

/** Why a provider sign-in ended without a session. The browser is told this word, nothing more. */
type OidcFailure = 'denied' | 'expired' | 'failed' | 'no_account' | 'unverified_email' | 'conflict';

export type OidcLoginResult =
  { ok: true; userId: number } | { ok: false; reason: OidcFailure; cause?: unknown };

function hashBrowserToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Records a sign-in and returns the provider URL to send the browser to, with the token the
 * browser keeps in a cookie. Only a digest of that token is stored.
 */
export async function startOidcLogin(settings: OidcClientSettings, now = new Date()) {
  const endpoints = await discoverEndpoints(settings, now.getTime());
  const browserToken = randomUrlToken();
  const attempt = {
    state: randomUrlToken(),
    nonce: randomUrlToken(),
    codeVerifier: randomUrlToken(),
  };
  // Expired attempts go here too, so the table stays bounded by the lifetime even if the
  // cleanup job is slow.
  await db.delete(oidcLoginAttempts).where(lt(oidcLoginAttempts.expiresAt, now));
  await db.insert(oidcLoginAttempts).values({
    id: hashBrowserToken(browserToken),
    ...attempt,
    expiresAt: new Date(now.getTime() + LOGIN_ATTEMPT_TTL_MS),
  });
  return { browserToken, location: buildAuthorizationUrl(endpoints, settings, attempt) };
}

// Single use: a replayed or concurrent callback finds nothing.
async function takeAttempt(browserToken: string, now: Date) {
  const [row] = await db
    .delete(oidcLoginAttempts)
    .where(
      and(
        eq(oidcLoginAttempts.id, hashBrowserToken(browserToken)),
        gt(oidcLoginAttempts.expiresAt, now),
      ),
    )
    .returning();
  return row ?? null;
}

/** Forgets a sign-in whose callback carried an error, so its token cannot be used again. */
export async function discardOidcLogin(browserToken: string): Promise<void> {
  await db
    .delete(oidcLoginAttempts)
    .where(eq(oidcLoginAttempts.id, hashBrowserToken(browserToken)));
}

type Profile = { subject: string; email: string | null; emailVerified: boolean };

/**
 * The account for a provider identity. A known subject signs straight in. An unknown one is
 * linked to the existing account with the same verified email address; a provider login never
 * creates an account, so who may use Quro stays with the operator's invitations.
 *
 * Quro does not verify the email address of an account, so in `open` registration mode anyone
 * could have registered an address that is not theirs and be handed its owner's provider login.
 * Linking by email is therefore refused there; the sign-in also ends the account's other
 * sessions, which a password holder from before the link could still use.
 */
async function resolveAccount(
  issuer: string,
  profile: Profile,
  mayLinkByEmail: boolean,
): Promise<{ userId: number } | { reason: 'no_account' | 'unverified_email' | 'conflict' }> {
  const known = await findIdentity(issuer, profile.subject);
  if (known) return { userId: known };

  if (!profile.email || !mayLinkByEmail) return { reason: 'no_account' };
  if (!profile.emailVerified) return { reason: 'unverified_email' };
  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, profile.email));
  if (!user) return { reason: 'no_account' };

  try {
    await db.insert(oidcIdentities).values({ userId: user.id, issuer, subject: profile.subject });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    // Two sign-ins of the same person raced, or the account is linked to another identity.
    return (await findIdentity(issuer, profile.subject)) === user.id
      ? { userId: user.id }
      : { reason: 'conflict' };
  }
  await revokeUserSessions(user.id, null);
  return { userId: user.id };
}

async function findIdentity(issuer: string, subject: string): Promise<number | null> {
  const [row] = await db
    .select({ userId: oidcIdentities.userId })
    .from(oidcIdentities)
    .where(and(eq(oidcIdentities.issuer, issuer), eq(oidcIdentities.subject, subject)));
  return row?.userId ?? null;
}

/** Completes a sign-in from the provider's redirect. */
export async function finishOidcLogin(
  settings: OidcClientSettings,
  input: { browserToken: string | undefined; state: string | undefined; code: string | undefined },
  now = new Date(),
): Promise<OidcLoginResult> {
  if (!input.browserToken || !input.state || !input.code) return { ok: false, reason: 'expired' };
  const attempt = await takeAttempt(input.browserToken, now);
  // The state must come back to the browser that started the sign-in, or someone else's
  // authorization link could sign this browser in to their account.
  if (!attempt || !safeEqual(attempt.state, input.state)) return { ok: false, reason: 'expired' };

  try {
    const endpoints = await discoverEndpoints(settings, now.getTime());
    const tokens = await exchangeCode(endpoints, settings, input.code, attempt.codeVerifier);
    const subject = verifyIdToken(tokens.idToken, settings, attempt.nonce, now.getTime());
    const identity = await fetchIdentity(endpoints, tokens.accessToken, subject);
    const account = await resolveAccount(
      settings.issuer,
      identity,
      getRegistrationMode() !== 'open',
    );
    return 'userId' in account ? { ok: true, userId: account.userId } : { ok: false, ...account };
  } catch (error) {
    if (error instanceof OidcError) return { ok: false, reason: 'failed', cause: error };
    throw error;
  }
}
