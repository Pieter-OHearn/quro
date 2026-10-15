import { STATE_COOKIE } from '../routes/bunq';
import { reloadConfig } from '../config';
import { testSecretsKeyFile } from './config';

export const BUNQ_TEST_ORIGIN = 'https://quro.example';

const BUNQ_ENV_NAMES = [
  'BUNQ_CLIENT_ID',
  'BUNQ_CLIENT_SECRET',
  'BUNQ_REDIRECT_URI',
  'FRONTEND_ORIGIN',
  'QRO_SECRETS_KEY_FILE',
] as const;

export function setBunqTestEnv(): void {
  process.env.BUNQ_CLIENT_ID = 'test-client';
  process.env.BUNQ_CLIENT_SECRET = 'test-secret';
  process.env.BUNQ_REDIRECT_URI = `${BUNQ_TEST_ORIGIN}/api/bunq/oauth/callback`;
  process.env.FRONTEND_ORIGIN = BUNQ_TEST_ORIGIN;
  // bunq credentials are stored encrypted, so linking needs a secrets key.
  process.env.QRO_SECRETS_KEY_FILE = testSecretsKeyFile();
  reloadConfig();
}

export function clearBunqTestEnv(): void {
  for (const name of BUNQ_ENV_NAMES) delete process.env[name];
  reloadConfig();
}

// The callback only accepts a state that the initiating browser also carries as a cookie.
export function bunqStateCookie(state: string): string {
  return `${STATE_COOKIE}=${state}`;
}
