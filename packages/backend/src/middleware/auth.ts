import { createMiddleware } from 'hono/factory';
import { db } from '../db/client';
import { partnerLinks, sessions, users } from '../db/schema';
import { and, eq, or, sql } from 'drizzle-orm';
import { HTTP_STATUS } from '../constants/http';

import { PUBLIC_PATHS } from '../lib/publicPaths';
import { getSessionCookieHash, SESSION_TOUCH_INTERVAL_MS } from '../lib/sessions';

export const requireAuth = createMiddleware(async (c, next) => {
  if (PUBLIC_PATHS.has(c.req.path)) {
    await next();
    return;
  }

  // Sessions are stored by token digest, so a database read alone cannot yield a usable cookie.
  const sessionId = getSessionCookieHash(c);
  if (!sessionId) {
    return c.json({ error: 'Authentication required' }, HTTP_STATUS.UNAUTHORIZED);
  }

  const [row] = await db
    .select({
      id: users.id,
      email: users.email,
      expiresAt: sessions.expiresAt,
      lastUsedAt: sessions.lastUsedAt,
      partnerId: sql<number | null>`CASE WHEN ${partnerLinks.requesterId} = ${users.id}
        THEN ${partnerLinks.addresseeId} ELSE ${partnerLinks.requesterId} END`,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .leftJoin(
      partnerLinks,
      and(
        eq(partnerLinks.status, 'accepted'),
        or(eq(partnerLinks.requesterId, users.id), eq(partnerLinks.addresseeId, users.id)),
      ),
    )
    .where(eq(sessions.id, sessionId));

  const now = new Date();
  if (!row || row.expiresAt < now) {
    return c.json({ error: 'Session expired' }, HTTP_STATUS.UNAUTHORIZED);
  }

  if (now.getTime() - row.lastUsedAt.getTime() > SESSION_TOUCH_INTERVAL_MS) {
    await db.update(sessions).set({ lastUsedAt: now }).where(eq(sessions.id, sessionId));
  }

  c.set('user', { id: row.id, email: row.email });
  c.set('partnerId', row.partnerId);
  c.set('sessionId', sessionId);
  await next();
});
