import { readApiErrorMessage } from '@/lib/api';

export function getAuthErrorMessage(error: unknown, fallback: string): string {
  return readApiErrorMessage(error) ?? fallback;
}
