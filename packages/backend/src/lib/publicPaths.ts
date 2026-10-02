// Exact paths only: adding a route under an existing prefix does not make it public.
export const PUBLIC_PATHS = new Set([
  '/api/auth/signin',
  '/api/auth/signup',
  '/api/auth/signout',
  '/api/auth/me',
  '/api/health',
  '/api/readiness',
  '/api/readiness/pension-import',
  // The signed OAuth state identifies the user even without a session cookie.
  '/api/bunq/oauth/callback',
]);
