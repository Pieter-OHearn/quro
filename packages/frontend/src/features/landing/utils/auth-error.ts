import { readApiErrorMessage } from '@/lib/api';

export function getAuthErrorMessage(error: unknown, fallback: string): string {
  return readApiErrorMessage(error) ?? fallback;
}

/** Puts a sign-up failure next to the code field when it is about the code, else on email. */
export function signUpErrorField(message: string): 'inviteCode' | 'email' {
  return /\bcode\b|registration is closed/i.test(message) ? 'inviteCode' : 'email';
}
