import type { PasswordStrength } from '../types';

const MIN_PASSWORD_LENGTH = 8;
export const PASSWORD_STRENGTH_LEVELS = ['Weak', 'Fair', 'Good', 'Strong'] as const;
const PASSWORD_STRENGTH_COLORS = [
  'bg-rose-400',
  'bg-amber-400',
  'bg-blue-400',
  'bg-emerald-500',
] as const;
const PASSWORD_STRENGTH_TEXT_COLORS = [
  'text-rose-500',
  'text-rose-500',
  'text-amber-500',
  'text-blue-500',
  'text-emerald-600',
] as const;

export function computeStrength(password: string): PasswordStrength {
  const score = [
    password.length >= MIN_PASSWORD_LENGTH,
    /[A-Z]/.test(password),
    /[0-9]/.test(password),
    /[^A-Za-z0-9]/.test(password),
  ].filter(Boolean).length;

  const label = score > 0 ? PASSWORD_STRENGTH_LEVELS[score - 1] : '';
  const color = score > 0 ? PASSWORD_STRENGTH_COLORS[score - 1] : '';
  const textColor = PASSWORD_STRENGTH_TEXT_COLORS[score] ?? PASSWORD_STRENGTH_TEXT_COLORS[0];

  return { score, label, color, textColor };
}
