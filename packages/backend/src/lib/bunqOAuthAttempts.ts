import { createHash, randomBytes } from 'node:crypto';
import { and, eq, gt, isNull, lt, or } from 'drizzle-orm';
import { db } from '../db/client';
import { bunqOauthAttempts } from '../db/schema';

export const OAUTH_ATTEMPT_TTL_MS = 10 * 60 * 1000;

export type BunqOAuthDestination = 'savings' | 'settings';

export type ConsumedOAuthAttempt = {
  userId: number;
  destination: BunqOAuthDestination;
};

function hashState(state: string): string {
  return createHash('sha256').update(state).digest('hex');
}

// Records a short-lived attempt for the user and destination and returns the opaque
// state to send to bunq. Only its hash is stored.
export async function createOAuthAttempt(
  userId: number,
  destination: BunqOAuthDestination,
  now = new Date(),
): Promise<string> {
  const state = randomBytes(32).toString('hex');
  await db
    .delete(bunqOauthAttempts)
    .where(or(lt(bunqOauthAttempts.expiresAt, now), eq(bunqOauthAttempts.userId, userId)));
  await db.insert(bunqOauthAttempts).values({
    stateHash: hashState(state),
    userId,
    destination,
    expiresAt: new Date(now.getTime() + OAUTH_ATTEMPT_TTL_MS),
  });
  return state;
}

// Atomically marks the attempt consumed. A single UPDATE ... RETURNING means that of
// any number of concurrent callbacks carrying the same state, exactly one succeeds;
// forged, expired and replayed states return null.
export async function consumeOAuthAttempt(
  state: string,
  now = new Date(),
): Promise<ConsumedOAuthAttempt | null> {
  const [row] = await db
    .update(bunqOauthAttempts)
    .set({ consumedAt: now })
    .where(
      and(
        eq(bunqOauthAttempts.stateHash, hashState(state)),
        isNull(bunqOauthAttempts.consumedAt),
        gt(bunqOauthAttempts.expiresAt, now),
      ),
    )
    .returning({
      userId: bunqOauthAttempts.userId,
      destination: bunqOauthAttempts.destination,
    });
  return row ?? null;
}
