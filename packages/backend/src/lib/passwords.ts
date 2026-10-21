// Password hashing in one place. An account created by the operator with `quro user create` has no
// password: its hash is the empty string, which no password verifies against (see `verifyPassword`),
// so the account can only be reached through single sign-on until an operator issues a reset code.

const BCRYPT_COST = 10;

/** The stored hash of an account that has no password. */
export const NO_PASSWORD_HASH = '';

// Verified against when an account is unknown or has no password, so the answer takes as long as
// a real check and does not tell the two apart.
const DUMMY_PASSWORD_HASH = await Bun.password.hash('quro-dummy-password', {
  algorithm: 'bcrypt',
  cost: BCRYPT_COST,
});

export function hashPassword(password: string): Promise<string> {
  return Bun.password.hash(password, { algorithm: 'bcrypt', cost: BCRYPT_COST });
}

/**
 * Whether `password` matches `hash`. A missing or empty hash never matches, whatever the password
 * is, and still takes the time of a real check.
 */
export async function verifyPassword(
  password: string,
  hash: string | null | undefined,
): Promise<boolean> {
  const stored = hash || DUMMY_PASSWORD_HASH;
  const matches = await Bun.password.verify(password, stored);
  return Boolean(hash) && matches;
}
