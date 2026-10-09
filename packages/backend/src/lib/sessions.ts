import { createHash, randomBytes } from 'node:crypto';
import type { Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { and, desc, eq, gt, ne } from 'drizzle-orm';
import type { UserSession } from '@quro/shared';
import { getConfig } from '../config';
import { db, type DbExecutor } from '../db/client';
import { sessions } from '../db/schema';
import { DAY_MS, MINUTE_MS, MS_PER_SECOND } from '../constants/time';

export const SESSION_COOKIE = 'session';
export const CSRF_COOKIE = 'csrf_token';

const TOKEN_BYTES = 32;
const SESSION_DURATION_DAYS = 30;
const USER_AGENT_MAX_LENGTH = 256;
export const SESSION_DURATION_MS = SESSION_DURATION_DAYS * DAY_MS;
// last_used_at is advisory (shown in the session list), so it is refreshed at most this often.
const SESSION_TOUCH_INTERVAL_MINUTES = 5;
export const SESSION_TOUCH_INTERVAL_MS = SESSION_TOUCH_INTERVAL_MINUTES * MINUTE_MS;

/**
 * Whether session cookies carry the Secure flag. It is configuration (`SECURE_COOKIES`), never
 * inferred from forwarded headers a client could send.
 */
export function secureCookiesEnabled(): boolean {
  return getConfig().web.secureCookies;
}

// Raw tokens are base64url, which never matches the stored hex digest format.
export function generateSessionToken(): string {
  return randomBytes(TOKEN_BYTES).toString('base64url');
}

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function cookieOptions(httpOnly: boolean) {
  return {
    httpOnly,
    secure: secureCookiesEnabled(),
    sameSite: 'Lax',
    path: '/',
  } as const;
}

function readUserAgent(c: Context): string | null {
  const userAgent = c.req.header('user-agent')?.trim();
  return userAgent ? userAgent.slice(0, USER_AGENT_MAX_LENGTH) : null;
}

/** Digest of the request's session cookie, or null when there is none. */
export function getSessionCookieHash(c: Context): string | null {
  const token = getCookie(c, SESSION_COOKIE);
  return token ? hashSessionToken(token) : null;
}

export async function createSession(c: Context, userId: number, executor: DbExecutor = db) {
  const token = generateSessionToken();
  const csrfToken = randomBytes(TOKEN_BYTES).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
  const maxAge = SESSION_DURATION_MS / MS_PER_SECOND;

  await executor
    .insert(sessions)
    .values({ id: hashSessionToken(token), userId, expiresAt, userAgent: readUserAgent(c) });

  setCookie(c, SESSION_COOKIE, token, { ...cookieOptions(true), maxAge });
  setCookie(c, CSRF_COOKIE, csrfToken, { ...cookieOptions(false), maxAge });
}

export function clearSessionCookies(c: Context) {
  deleteCookie(c, SESSION_COOKIE, cookieOptions(true));
  deleteCookie(c, CSRF_COOKIE, cookieOptions(false));
}

export async function listUserSessions(
  userId: number,
  currentSessionId: string | null,
): Promise<UserSession[]> {
  const rows = await db
    .select({
      id: sessions.id,
      userAgent: sessions.userAgent,
      createdAt: sessions.createdAt,
      lastUsedAt: sessions.lastUsedAt,
      expiresAt: sessions.expiresAt,
    })
    .from(sessions)
    .where(and(eq(sessions.userId, userId), gt(sessions.expiresAt, new Date())))
    .orderBy(desc(sessions.lastUsedAt));

  // The current browser comes first; last_used_at is only refreshed every few minutes.
  return rows
    .map((row) => ({
      id: row.id,
      current: row.id === currentSessionId,
      userAgent: row.userAgent,
      createdAt: row.createdAt.toISOString(),
      lastUsedAt: row.lastUsedAt.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
    }))
    .sort((a, b) => Number(b.current) - Number(a.current));
}

/** Revokes one of the user's sessions; returns false when it is not theirs or already gone. */
export async function revokeUserSession(userId: number, sessionId: string): Promise<boolean> {
  const removed = await db
    .delete(sessions)
    .where(and(eq(sessions.userId, userId), eq(sessions.id, sessionId)))
    .returning({ id: sessions.id });
  return removed.length > 0;
}

/** Revokes every session of the user except `keepSessionId` (all of them when it is null). */
export async function revokeUserSessions(
  userId: number,
  keepSessionId: string | null,
  executor: DbExecutor = db,
): Promise<number> {
  const removed = await executor
    .delete(sessions)
    .where(
      keepSessionId
        ? and(eq(sessions.userId, userId), ne(sessions.id, keepSessionId))
        : eq(sessions.userId, userId),
    )
    .returning({ id: sessions.id });
  return removed.length;
}
