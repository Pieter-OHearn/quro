import { createMiddleware } from 'hono/factory';
import { getCookie } from 'hono/cookie';
import { db } from '../db/client';
import { partnerLinks, sessions, users } from '../db/schema';
import { and, eq, or, sql } from 'drizzle-orm';
import { HTTP_STATUS } from '../constants/http';

import { PUBLIC_PATHS } from '../lib/publicPaths';

export const requireAuth = createMiddleware(async (c, next) => {
  if (PUBLIC_PATHS.has(c.req.path)) {
    await next();
    return;
  }

  const sessionId = getCookie(c, 'session');
  if (!sessionId) {
    return c.json({ error: 'Authentication required' }, HTTP_STATUS.UNAUTHORIZED);
  }

  const [row] = await db
    .select({
      id: users.id,
      email: users.email,
      expiresAt: sessions.expiresAt,
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

  if (!row || row.expiresAt < new Date()) {
    return c.json({ error: 'Session expired' }, HTTP_STATUS.UNAUTHORIZED);
  }

  c.set('user', { id: row.id, email: row.email });
  c.set('partnerId', row.partnerId);
  await next();
});
