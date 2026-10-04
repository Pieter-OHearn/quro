export const BUNQ_TEST_ORIGIN = 'https://quro.example';

const BUNQ_ENV_NAMES = [
  'BUNQ_CLIENT_ID',
  'BUNQ_CLIENT_SECRET',
  'BUNQ_REDIRECT_URI',
  'FRONTEND_ORIGIN',
] as const;

export function setBunqTestEnv(): void {
  process.env.BUNQ_CLIENT_ID = 'test-client';
  process.env.BUNQ_CLIENT_SECRET = 'test-secret';
  process.env.BUNQ_REDIRECT_URI = `${BUNQ_TEST_ORIGIN}/api/bunq/oauth/callback`;
  process.env.FRONTEND_ORIGIN = BUNQ_TEST_ORIGIN;
}

export function clearBunqTestEnv(): void {
  for (const name of BUNQ_ENV_NAMES) delete process.env[name];
}
