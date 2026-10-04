// Bunq linking is optional. With none of the variables below set it is disabled and
// every OAuth path fails closed; setting only some of them is a startup error.
const REQUIRED_VARIABLES = [
  'BUNQ_CLIENT_ID',
  'BUNQ_CLIENT_SECRET',
  'BUNQ_REDIRECT_URI',
  'FRONTEND_ORIGIN',
] as const;

// FRONTEND_ORIGIN is shared with the rest of the app, so on its own it does not
// signal an intent to enable bunq.
const ENABLING_VARIABLES = ['BUNQ_CLIENT_ID', 'BUNQ_CLIENT_SECRET', 'BUNQ_REDIRECT_URI'] as const;

export const BUNQ_UNAVAILABLE_MESSAGE =
  'Bunq linking is unavailable because this Quro instance has not configured it.';

export type BunqConfig =
  | { enabled: false }
  | {
      enabled: true;
      clientId: string;
      clientSecret: string;
      redirectUri: string;
      frontendOrigin: string;
      sandbox: boolean;
    };

type Env = Readonly<Record<string, string | undefined>>;

function readVariable(env: Env, name: string): string {
  return env[name]?.trim() ?? '';
}

function isHttpUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

// Errors name variables only, never their values, so they are safe to log.
export function loadBunqConfig(env: Env = process.env): BunqConfig {
  const values = Object.fromEntries(REQUIRED_VARIABLES.map((n) => [n, readVariable(env, n)]));
  if (ENABLING_VARIABLES.every((name) => !values[name])) return { enabled: false };

  const missing = REQUIRED_VARIABLES.filter((name) => !values[name]);
  if (missing.length > 0) {
    throw new Error(`Bunq is partially configured; missing ${missing.join(', ')}`);
  }

  const invalid = (['BUNQ_REDIRECT_URI', 'FRONTEND_ORIGIN'] as const).filter(
    (name) => !isHttpUrl(values[name]),
  );
  if (invalid.length > 0) {
    throw new Error(`Bunq configuration has invalid URL values for ${invalid.join(', ')}`);
  }

  return {
    enabled: true,
    clientId: values.BUNQ_CLIENT_ID,
    clientSecret: values.BUNQ_CLIENT_SECRET,
    redirectUri: values.BUNQ_REDIRECT_URI,
    frontendOrigin: new URL(values.FRONTEND_ORIGIN).origin,
    sandbox: readVariable(env, 'BUNQ_SANDBOX') === 'true',
  };
}

export function getBunqConfig(): BunqConfig {
  return loadBunqConfig();
}

export type EnabledBunqConfig = Extract<BunqConfig, { enabled: true }>;

export function requireBunqConfig(): EnabledBunqConfig {
  const config = getBunqConfig();
  if (!config.enabled) throw new Error(BUNQ_UNAVAILABLE_MESSAGE);
  return config;
}
