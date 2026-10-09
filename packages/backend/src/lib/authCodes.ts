import { createHash, randomBytes } from 'node:crypto';
import { and, asc, eq, gt, isNull, lt, or, sql } from 'drizzle-orm';
import { db, type DbExecutor } from '../db/client';
import { authCodes } from '../db/schema';
import { DAY_MS, HOUR_MS } from '../constants/time';

export type AuthCodePurpose = (typeof authCodes.purpose.enumValues)[number];

const REGISTRATION_CODE_TTL_DAYS = 7;
export const REGISTRATION_CODE_TTL_MS = REGISTRATION_CODE_TTL_DAYS * DAY_MS;
export const PASSWORD_RESET_CODE_TTL_MS = HOUR_MS;
// Consumed and expired codes are kept this long for the operator's `auth codes` audit list.
const AUTH_CODE_RETENTION_DAYS = 30;
const AUTH_CODE_RETENTION_MS = AUTH_CODE_RETENTION_DAYS * DAY_MS;

// Crockford base32: no I, L, O or U, so codes survive being read aloud or retyped.
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
// 24 characters of 5 bits each: 120 bits, above the 112 bits from which ASVS 6.5.2 allows a
// one-way hash instead of a password hash.
const CODE_LENGTH = 24;
const GROUP_LENGTH = 6;
const MAX_INPUT_LENGTH = 64;
const ALPHABET_MASK = ALPHABET.length - 1;

export type IssuedAuthCode = {
  id: number;
  code: string;
  expiresAt: Date;
};

export type PendingAuthCode = {
  id: number;
  purpose: AuthCodePurpose;
  userId: number | null;
  expiresAt: Date;
  consumedAt: Date | null;
  consumedByUserId: number | null;
  createdAt: Date;
};

export function generateAuthCode(): string {
  // 256 is a multiple of 32, so masking each byte keeps the characters uniform.
  const chars = Array.from(randomBytes(CODE_LENGTH), (byte) => ALPHABET[byte & ALPHABET_MASK]);
  const groups: string[] = [];
  for (let i = 0; i < CODE_LENGTH; i += GROUP_LENGTH) {
    groups.push(chars.slice(i, i + GROUP_LENGTH).join(''));
  }
  return groups.join('-');
}

/** Uppercases, drops separators and maps the Crockford look-alikes I/L to 1 and O to 0. */
export function normalizeAuthCode(input: string): string {
  return input
    .slice(0, MAX_INPUT_LENGTH)
    .toUpperCase()
    .replaceAll(/[\s-]/g, '')
    .replaceAll(/[IL]/g, '1')
    .replaceAll('O', '0');
}

/**
 * Codes are random, single-use and longer than 112 bits, so a one-way hash is enough: unlike a
 * password, a code cannot be guessed from a dictionary, and salting or stretching would add no
 * meaningful protection.
 */
export function hashAuthCode(code: string): string {
  return createHash('sha256').update(normalizeAuthCode(code)).digest('hex');
}

async function insertCode(
  executor: DbExecutor,
  purpose: AuthCodePurpose,
  userId: number | null,
  ttlMs: number,
  now: Date,
): Promise<IssuedAuthCode> {
  const code = generateAuthCode();
  const expiresAt = new Date(now.getTime() + ttlMs);
  const [row] = await executor
    .insert(authCodes)
    .values({ codeHash: hashAuthCode(code), purpose, userId, expiresAt, createdAt: now })
    .returning({ id: authCodes.id });
  return { id: row.id, code, expiresAt };
}

export function issueRegistrationCode(
  options: { ttlMs?: number; now?: Date } = {},
  executor: DbExecutor = db,
): Promise<IssuedAuthCode> {
  return insertCode(
    executor,
    'registration',
    null,
    options.ttlMs ?? REGISTRATION_CODE_TTL_MS,
    options.now ?? new Date(),
  );
}

/** Issues a reset code for the user and withdraws any earlier unused one. */
export function issuePasswordResetCode(
  userId: number,
  options: { ttlMs?: number; now?: Date } = {},
  executor: DbExecutor = db,
): Promise<IssuedAuthCode> {
  return executor.transaction(async (tx) => {
    // Serialise per account so concurrent issues cannot leave two valid codes behind.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('quro:password-reset'), ${userId})`);
    await tx
      .delete(authCodes)
      .where(
        and(
          eq(authCodes.purpose, 'password_reset'),
          eq(authCodes.userId, userId),
          isNull(authCodes.consumedAt),
        ),
      );
    return insertCode(
      tx,
      'password_reset',
      userId,
      options.ttlMs ?? PASSWORD_RESET_CODE_TTL_MS,
      options.now ?? new Date(),
    );
  });
}

/**
 * Atomically marks an unexpired, unused code consumed. Of any number of concurrent callers
 * presenting the same code exactly one gets the row back; unknown, expired, used and
 * wrong-purpose codes return null.
 */
export async function consumeAuthCode(
  executor: DbExecutor,
  code: string,
  purpose: AuthCodePurpose,
  now = new Date(),
): Promise<{ id: number; userId: number | null } | null> {
  const [row] = await executor
    .update(authCodes)
    .set({ consumedAt: now, consumedByUserId: sql`${authCodes.userId}` })
    .where(
      and(
        eq(authCodes.codeHash, hashAuthCode(code)),
        eq(authCodes.purpose, purpose),
        isNull(authCodes.consumedAt),
        gt(authCodes.expiresAt, now),
      ),
    )
    .returning({ id: authCodes.id, userId: authCodes.userId });
  return row ?? null;
}

export async function recordAuthCodeUser(executor: DbExecutor, codeId: number, userId: number) {
  await executor
    .update(authCodes)
    .set({ consumedByUserId: userId })
    .where(eq(authCodes.id, codeId));
}

export function listAuthCodes(): Promise<PendingAuthCode[]> {
  return db
    .select({
      id: authCodes.id,
      purpose: authCodes.purpose,
      userId: authCodes.userId,
      expiresAt: authCodes.expiresAt,
      consumedAt: authCodes.consumedAt,
      consumedByUserId: authCodes.consumedByUserId,
      createdAt: authCodes.createdAt,
    })
    .from(authCodes)
    .orderBy(asc(authCodes.createdAt));
}

/** Withdraws an unused code. Returns false when it does not exist or was already used. */
export async function revokeAuthCode(id: number): Promise<boolean> {
  const removed = await db
    .delete(authCodes)
    .where(and(eq(authCodes.id, id), isNull(authCodes.consumedAt)))
    .returning({ id: authCodes.id });
  return removed.length > 0;
}

export async function purgeStaleAuthCodes(now = new Date()): Promise<void> {
  const cutoff = new Date(now.getTime() - AUTH_CODE_RETENTION_MS);
  await db
    .delete(authCodes)
    .where(or(lt(authCodes.expiresAt, cutoff), lt(authCodes.consumedAt, cutoff)));
}
