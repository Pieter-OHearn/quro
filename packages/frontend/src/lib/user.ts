import type { User } from '@quro/shared';

type UserIdentity = Pick<User, 'firstName' | 'lastName' | 'email'>;

export function getUserDisplayName(
  user: UserIdentity | null | undefined,
  fallback = 'User',
): string {
  if (!user) return fallback;

  const fullName = `${user.firstName} ${user.lastName}`.trim();
  if (fullName) return fullName;
  if (user.email.trim()) return user.email.trim();
  return fallback;
}

export function getUserInitials(user: UserIdentity | null | undefined, fallback = 'U'): string {
  if (!user) return fallback;

  const parts = [user.firstName, user.lastName].filter(Boolean);
  if (parts.length > 0) {
    return parts
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('');
  }

  const emailInitial = user.email.trim()[0]?.toUpperCase();
  return emailInitial ?? fallback;
}
