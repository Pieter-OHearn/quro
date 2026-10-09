import { getConfig } from '../config';

// Connection strings come from the validated configuration (src/config). These accessors keep the
// database layer's call sites short; each throws a `ConfigError` naming the settings that are
// missing when its role cannot be configured.

export function getRuntimeDatabaseUrl() {
  return getConfig().runtimeDatabase.url.reveal();
}

export function getAdminDatabaseUrl() {
  return getConfig().adminDatabase.url.reveal();
}

export function getBootstrapDatabaseUrl() {
  return getConfig().adminDatabase.bootstrapUrl.reveal();
}

export function redactDatabaseUrl(connectionString: string) {
  try {
    const url = new URL(connectionString);
    if (url.password) {
      url.password = '***';
    }
    return url.toString();
  } catch {
    return connectionString;
  }
}
