// Exact paths only: adding a route under an existing prefix does not make it public.
export const PUBLIC_PATHS = new Set([
  '/api/auth/signin',
  '/api/auth/signup',
  '/api/auth/signout',
  '/api/auth/me',
  '/api/health',
  '/api/readiness',
  '/api/readiness/pension-import',
  // A server-recorded, single-use OAuth attempt identifies the user without a session cookie.
  '/api/bunq/oauth/callback',
]);
