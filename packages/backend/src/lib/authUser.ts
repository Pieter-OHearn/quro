import type { Context } from 'hono';

export type AuthUser = {
  id: number;
  email: string;
};

export function getAuthUser(c: Context): AuthUser {
  return c.get('user') as AuthUser;
}

export function getPartnerId(c: Context): number | null {
  return (c.get('partnerId') as number | null | undefined) ?? null;
}
