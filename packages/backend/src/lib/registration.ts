import { eq, sql } from 'drizzle-orm';
import { REGISTRATION_MODES, type RegistrationMode, type RegistrationPolicy } from '@quro/shared';
import { db, type DbExecutor } from '../db/client';
import { users } from '../db/schema';
import { consumeAuthCode, recordAuthCodeUser } from './authCodes';
import { isUniqueViolation } from './postgresErrors';
import { publicUserColumns } from './users';

export const DEFAULT_REGISTRATION_MODE: RegistrationMode = 'invite';

/**
 * Parses `REGISTRATION_MODE`. Unset means invite-only; an unknown value is a startup error so a
 * typo cannot open registration.
 */
export function parseRegistrationMode(raw: string | undefined): RegistrationMode {
  const value = raw?.trim() ?? '';
  if (value === '') return DEFAULT_REGISTRATION_MODE;
  if ((REGISTRATION_MODES as readonly string[]).includes(value)) {
    return value as RegistrationMode;
  }
  throw new Error(`REGISTRATION_MODE must be one of ${REGISTRATION_MODES.join(', ')}`);
}

export function getRegistrationMode(): RegistrationMode {
  return parseRegistrationMode(process.env.REGISTRATION_MODE);
}

/**
 * What a sign-up needs. Until the first account exists every mode requires an operator-issued
 * code, so whoever reaches a fresh instance first cannot claim it.
 */
export function registrationRequirement(
  mode: RegistrationMode,
  hasAccounts: boolean,
): RegistrationPolicy['signUp'] {
  if (!hasAccounts) return 'code';
  if (mode === 'closed') return 'closed';
  return mode === 'invite' ? 'code' : 'open';
}

async function hasAnyAccount(executor: DbExecutor): Promise<boolean> {
  const [row] = await executor.select({ id: users.id }).from(users).limit(1);
  return Boolean(row);
}

export async function getRegistrationPolicy(
  mode: RegistrationMode = getRegistrationMode(),
  executor: DbExecutor = db,
): Promise<RegistrationPolicy> {
  const hasAccounts = await hasAnyAccount(executor);
  return {
    signUp: registrationRequirement(mode, hasAccounts),
    setupRequired: !hasAccounts,
  };
}

export type RegistrationRejection = 'closed' | 'code_required' | 'invalid_code' | 'email_taken';

class RegistrationRejected extends Error {
  constructor(
    readonly reason: RegistrationRejection,
    readonly firstAccount: boolean,
  ) {
    super(reason);
  }
}

type NewUser = Omit<typeof users.$inferInsert, 'id' | 'createdAt' | 'passwordUpdatedAt'>;

/**
 * Creates an account if the registration policy allows it. Sign-ups are serialized with a
 * transaction-scoped advisory lock, so the "is this the first account?" decision and code
 * consumption cannot race; any rejection rolls back, leaving the code unused.
 *
 * The code is checked before the email, so in invite-only mode only code holders can learn
 * whether an address is registered.
 */
export async function registerAccount(
  input: { user: NewUser; code: string | null; mode: RegistrationMode },
  executor: DbExecutor = db,
) {
  let firstAccount = false;
  try {
    return await executor.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext('quro:registration'))`);
      firstAccount = !(await hasAnyAccount(tx));
      const requirement = registrationRequirement(input.mode, !firstAccount);
      if (requirement === 'closed') throw new RegistrationRejected('closed', firstAccount);

      let codeId: number | null = null;
      if (requirement === 'code') {
        if (!input.code) throw new RegistrationRejected('code_required', firstAccount);
        const consumed = await consumeAuthCode(tx, input.code, 'registration');
        if (!consumed) throw new RegistrationRejected('invalid_code', firstAccount);
        codeId = consumed.id;
      }

      const [existing] = await tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, input.user.email));
      if (existing) throw new RegistrationRejected('email_taken', firstAccount);

      const [user] = await tx.insert(users).values(input.user).returning(publicUserColumns);
      if (codeId !== null) await recordAuthCodeUser(tx, codeId, user.id);
      return { ok: true, user, firstAccount } as const;
    });
  } catch (error) {
    if (error instanceof RegistrationRejected) {
      return { ok: false, reason: error.reason, firstAccount: error.firstAccount } as const;
    }
    // A profile email change is not serialized with sign-ups; the unique index still holds.
    if (isUniqueViolation(error)) {
      return { ok: false, reason: 'email_taken' as RegistrationRejection, firstAccount } as const;
    }
    throw error;
  }
}
