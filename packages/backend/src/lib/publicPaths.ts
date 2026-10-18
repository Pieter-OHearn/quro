// Exact paths only: adding a route under an existing prefix does not make it public.
export const PUBLIC_PATHS = new Set([
  '/api/auth/signin',
  '/api/auth/signup',
  '/api/auth/signout',
  '/api/auth/me',
  '/api/auth/registration',
  // An operator-issued, single-use recovery code identifies the account.
  '/api/auth/password-reset',
  // Single sign-on: the browser is not signed in yet, and the callback's attempt cookie and state
  // identify the sign-in. Mounted only when a provider is configured.
  '/api/auth/oidc/login',
  '/api/auth/oidc/callback',
  '/api/health',
  '/api/readiness',
  '/api/readiness/pension-import',
  // A server-recorded, single-use OAuth attempt identifies the user without a session cookie.
  '/api/bunq/oauth/callback',
]);
