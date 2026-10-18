import { eq } from 'drizzle-orm';
import { createApp } from '../app';
import { generateSessionToken, hashSessionToken } from '../lib/sessions';
import { HOUR_MS } from '../constants/time';
import { db } from './client';
import { sessions } from './schema';

// The demo household is written through the application's own routes, in the process, so every
// balance, joint share and ledger effect comes from the code the app runs. A request carries a
// short-lived session of its own, removed again when the client closes.

const LOOPBACK_ENV = { requestIP: () => ({ address: '127.0.0.1', family: 'IPv4', port: 0 }) };
const SESSION_USER_AGENT = 'quro-demo-seed';

export class HouseholdApiError extends Error {
  constructor(
    readonly method: string,
    readonly path: string,
    readonly status: number,
    detail: string,
  ) {
    super(`${method} ${path} answered ${status}: ${detail}`);
    this.name = 'HouseholdApiError';
  }
}

export type HouseholdApi = {
  requests: number;
  get<T = unknown>(path: string): Promise<T>;
  post<T = unknown>(path: string, body?: unknown): Promise<T>;
  patch<T = unknown>(path: string, body: unknown): Promise<T>;
  put<T = unknown>(path: string, body: unknown): Promise<T>;
  /** Removes the session this client used. */
  close(): Promise<void>;
};

export async function openHouseholdApi(
  userId: number,
  app: ReturnType<typeof createApp> = createApp(),
): Promise<HouseholdApi> {
  const token = generateSessionToken();
  const csrfToken = generateSessionToken();
  const sessionId = hashSessionToken(token);
  await db.insert(sessions).values({
    id: sessionId,
    userId,
    expiresAt: new Date(Date.now() + HOUR_MS),
    userAgent: SESSION_USER_AGENT,
  });
  const cookie = `session=${token}; csrf_token=${csrfToken}`;
  const api: HouseholdApi = {
    requests: 0,
    get<T>(path: string) {
      return send<T>('GET', path);
    },
    post<T>(path: string, body?: unknown) {
      return send<T>('POST', path, body);
    },
    patch<T>(path: string, body: unknown) {
      return send<T>('PATCH', path, body);
    },
    put<T>(path: string, body: unknown) {
      return send<T>('PUT', path, body);
    },
    async close() {
      await db.delete(sessions).where(eq(sessions.id, sessionId));
    },
  };

  async function send<T>(method: string, path: string, body?: unknown): Promise<T> {
    api.requests += 1;
    const headers: Record<string, string> = { Cookie: cookie, 'X-CSRF-Token': csrfToken };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const response = await app.request(
      path,
      { method, headers, body: body === undefined ? undefined : JSON.stringify(body) },
      LOOPBACK_ENV,
    );
    const payload = (await response.json().catch(() => null)) as {
      data?: T;
      error?: string;
    } | null;
    if (!response.ok) {
      throw new HouseholdApiError(method, path, response.status, payload?.error ?? 'no detail');
    }
    return payload?.data as T;
  }

  return api;
}
