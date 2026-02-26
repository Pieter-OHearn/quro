import type { Context } from 'hono';

export type AuthUser = {
  id: number;
  name: string;
  email: string;
};

export function getAuthUser(c: Context): AuthUser {
  return c.get('user') as AuthUser;
}
