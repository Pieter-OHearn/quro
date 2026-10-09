import { getConfig, type BunqConfig } from '../config';

// Bunq linking is optional. With none of its settings present it is disabled and every OAuth path
// fails closed; a partial configuration stops startup (see src/config).

export type { BunqConfig };

export const BUNQ_UNAVAILABLE_MESSAGE =
  'Bunq linking is unavailable because this Quro instance has not configured it.';

export function getBunqConfig(): BunqConfig {
  return getConfig().bunq;
}

type EnabledBunqConfig = Extract<BunqConfig, { enabled: true }>;

export function requireBunqConfig(): EnabledBunqConfig {
  const config = getBunqConfig();
  if (!config.enabled) throw new Error(BUNQ_UNAVAILABLE_MESSAGE);
  return config;
}

const BUNQ_URLS = {
  production: {
    api: 'https://api.bunq.com/v1',
    oauth: 'https://api.oauth.bunq.com/v1',
    authorize: 'https://oauth.bunq.com/auth',
  },
  sandbox: {
    api: 'https://public-api.sandbox.bunq.com/v1',
    oauth: 'https://api-oauth.sandbox.bunq.com/v1',
    authorize: 'https://oauth.sandbox.bunq.com/auth',
  },
} as const;

/** Production endpoints unless `BUNQ_SANDBOX` is on. */
export function bunqUrls() {
  const config = getBunqConfig();
  return config.enabled && config.sandbox ? BUNQ_URLS.sandbox : BUNQ_URLS.production;
}
