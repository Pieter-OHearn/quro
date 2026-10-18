import { asc, eq } from 'drizzle-orm';
import { db } from '../db/client';
import { oidcIdentities } from '../db/schema';

// The link between an account and the person's account at the sign-in provider, as the account
// holder and the operator manage it. Removing it only forgets the link: the next provider sign-in
// finds no subject and links again by verified email, as the first one did.

/** The provider links of an account: where it is linked and since when, never the subject. */
export function listOidcLinks(userId: number) {
  return db
    .select({ issuer: oidcIdentities.issuer, linkedAt: oidcIdentities.createdAt })
    .from(oidcIdentities)
    .where(eq(oidcIdentities.userId, userId))
    .orderBy(asc(oidcIdentities.id));
}

/** Removes every provider link of the account and returns how many there were. */
export async function removeOidcLinks(userId: number): Promise<number> {
  const removed = await db
    .delete(oidcIdentities)
    .where(eq(oidcIdentities.userId, userId))
    .returning({ id: oidcIdentities.id });
  return removed.length;
}
