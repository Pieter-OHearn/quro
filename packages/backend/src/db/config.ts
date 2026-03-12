const DEFAULT_DATABASE_URL = 'postgres://quro:quro@127.0.0.1:5432/quro';

export function getRuntimeDatabaseUrl() {
  return process.env.APP_DATABASE_URL || process.env.DATABASE_URL || DEFAULT_DATABASE_URL;
}

export function getAdminDatabaseUrl() {
  return process.env.ADMIN_DATABASE_URL || process.env.DATABASE_URL || DEFAULT_DATABASE_URL;
}

export function getBootstrapDatabaseUrl() {
  return process.env.BOOTSTRAP_DATABASE_URL || getAdminDatabaseUrl();
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
