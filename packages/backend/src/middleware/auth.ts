import { createMiddleware } from 'hono/factory';
import { getCookie } from 'hono/cookie';
import { db } from '../db/client';
import { sessions, users } from '../db/schema';
import { eq } from 'drizzle-orm';
import { HTTP_STATUS } from '../constants/http';

export const requireAuth = createMiddleware(async (c, next) => {
  const sessionId = getCookie(c, 'session');
  if (!sessionId) {
    return c.json({ error: 'Authentication required' }, HTTP_STATUS.UNAUTHORIZED);
  }

  const [row] = await db
    .select({ id: users.id, email: users.email, expiresAt: sessions.expiresAt })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(eq(sessions.id, sessionId));

  if (!row || row.expiresAt < new Date()) {
    return c.json({ error: 'Session expired' }, HTTP_STATUS.UNAUTHORIZED);
  }

  c.set('user', { id: row.id, email: row.email });
  await next();
});
