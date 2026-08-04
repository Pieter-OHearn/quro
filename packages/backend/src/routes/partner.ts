import { Hono } from 'hono';
import { and, eq, inArray, or } from 'drizzle-orm';
import type { PartnerLink, PartnerProfile } from '@quro/shared';
import { db } from '../db/client';
import { mortgages, partnerLinks, properties, savingsAccounts, users } from '../db/schema';
import { HTTP_STATUS } from '../constants/http';
import { getAuthUser } from '../lib/authUser';
import { partnerInviteRateLimit } from '../middleware/rateLimit';
import { hasPostgresErrorCode } from '../lib/postgresErrors';

const app = new Hono();

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PG_UNIQUE_VIOLATION = '23505';

type PartnerLinkRow = typeof partnerLinks.$inferSelect;

function isUniqueViolation(error: unknown): boolean {
  return hasPostgresErrorCode(error, PG_UNIQUE_VIOLATION);
}

function linkInvolving(userId: number) {
  return or(eq(partnerLinks.requesterId, userId), eq(partnerLinks.addresseeId, userId));
}

async function findLinkInvolving(userId: number): Promise<PartnerLinkRow | null> {
  const [link] = await db.select().from(partnerLinks).where(linkInvolving(userId));
  return link ?? null;
}

async function getPartnerProfile(partnerId: number): Promise<PartnerProfile | null> {
  const [profile] = await db
    .select({
      id: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
    })
    .from(users)
    .where(eq(users.id, partnerId));
  return profile ?? null;
}

async function toPartnerLinkResponse(
  link: PartnerLinkRow,
  userId: number,
): Promise<PartnerLink | null> {
  const role = link.requesterId === userId ? 'requester' : 'addressee';
  const partnerId = role === 'requester' ? link.addresseeId : link.requesterId;
  const partner = await getPartnerProfile(partnerId);
  if (!partner) return null;
  return {
    id: link.id,
    status: link.status,
    role,
    createdAt: link.createdAt.toISOString(),
    partner,
  };
}

app.get('/', async (c) => {
  const user = getAuthUser(c);
  const link = await findLinkInvolving(user.id);
  if (!link) return c.json({ data: null });

  const data = await toPartnerLinkResponse(link, user.id);
  return c.json({ data });
});

app.post('/invite', async (c) => {
  const user = getAuthUser(c);

  if (partnerInviteRateLimit(String(user.id))) {
    return c.json(
      { error: 'Too many requests, please try again later' },
      HTTP_STATUS.TOO_MANY_REQUESTS,
    );
  }

  const payload = (await c.req.json()) as { email?: unknown };
  const email = typeof payload.email === 'string' ? payload.email.toLowerCase().trim() : '';

  if (!email || !EMAIL_PATTERN.test(email)) {
    return c.json({ error: 'Enter a valid email address' }, HTTP_STATUS.BAD_REQUEST);
  }

  let result;
  try {
    result = await db.transaction(async (tx) => {
      const [target] = await tx.select({ id: users.id }).from(users).where(eq(users.email, email));
      if (!target) {
        return { error: 'No Quro account with that email', status: HTTP_STATUS.NOT_FOUND } as const;
      }
      if (target.id === user.id) {
        return { error: 'You cannot invite yourself', status: HTTP_STATUS.BAD_REQUEST } as const;
      }

      const [existing] = await tx
        .select({ requesterId: partnerLinks.requesterId })
        .from(partnerLinks)
        .where(or(linkInvolving(user.id), linkInvolving(target.id)));
      if (existing) {
        const error =
          existing.requesterId === user.id || existing.requesterId === target.id
            ? 'A partner link already exists'
            : 'That user already has a partner link';
        return { error, status: HTTP_STATUS.CONFLICT } as const;
      }

      const [link] = await tx
        .insert(partnerLinks)
        .values({ requesterId: user.id, addresseeId: target.id })
        .returning();
      return { link } as const;
    });
  } catch (error) {
    // A concurrent invite can slip past the existence check at read-committed
    // isolation; the unique indexes reject it, which is a conflict, not a 500.
    if (isUniqueViolation(error)) {
      return c.json({ error: 'A partner link already exists' }, HTTP_STATUS.CONFLICT);
    }
    throw error;
  }

  if ('error' in result) {
    return c.json({ error: result.error }, result.status);
  }

  const data = await toPartnerLinkResponse(result.link, user.id);
  return c.json({ data }, HTTP_STATUS.CREATED);
});

app.post('/accept', async (c) => {
  const user = getAuthUser(c);
  const [link] = await db
    .update(partnerLinks)
    .set({ status: 'accepted', respondedAt: new Date() })
    .where(and(eq(partnerLinks.addresseeId, user.id), eq(partnerLinks.status, 'pending')))
    .returning();

  if (!link) {
    return c.json({ error: 'No pending invitation found' }, HTTP_STATUS.NOT_FOUND);
  }

  const data = await toPartnerLinkResponse(link, user.id);
  return c.json({ data });
});

app.post('/decline', async (c) => {
  const user = getAuthUser(c);
  const [link] = await db
    .delete(partnerLinks)
    .where(and(eq(partnerLinks.addresseeId, user.id), eq(partnerLinks.status, 'pending')))
    .returning();

  if (!link) {
    return c.json({ error: 'No pending invitation found' }, HTTP_STATUS.NOT_FOUND);
  }

  return c.json({ data: null });
});

app.delete('/', async (c) => {
  const user = getAuthUser(c);

  const removed = await db.transaction(async (tx) => {
    const [link] = await tx.select().from(partnerLinks).where(linkInvolving(user.id));
    if (!link) return false;

    if (link.status === 'accepted') {
      const memberIds = [link.requesterId, link.addresseeId];
      await tx
        .update(savingsAccounts)
        .set({ isJoint: false })
        .where(and(inArray(savingsAccounts.userId, memberIds), eq(savingsAccounts.isJoint, true)));
      await tx
        .update(properties)
        .set({ isJoint: false })
        .where(and(inArray(properties.userId, memberIds), eq(properties.isJoint, true)));
      await tx
        .update(mortgages)
        .set({ isJoint: false })
        .where(and(inArray(mortgages.userId, memberIds), eq(mortgages.isJoint, true)));
    }

    await tx.delete(partnerLinks).where(eq(partnerLinks.id, link.id));
    return true;
  });

  if (!removed) {
    return c.json({ error: 'No partner link found' }, HTTP_STATUS.NOT_FOUND);
  }

  return c.json({ data: null });
});

export default app;
