export const DEMO_USER_EMAIL = 'demo@quro.local';
/** The partner the optional demo household links to the demo user. */
export const DEMO_PARTNER_EMAIL = 'demo-partner@quro.local';
export const DEMO_USER_EMAILS: readonly string[] = [DEMO_USER_EMAIL, DEMO_PARTNER_EMAIL];

const VALID_IDENTIFIER_REGEX = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function parseConnectionString(connectionString: string) {
  const url = new URL(connectionString);
  return {
    database: decodeURIComponent(url.pathname.replace(/^\//, '')) || 'postgres',
    host: url.hostname || '127.0.0.1',
    password: decodeURIComponent(url.password),
    port: url.port || '5432',
    sslmode: url.searchParams.get('sslmode') ?? undefined,
    user: decodeURIComponent(url.username),
  };
}

export function quoteIdentifier(identifier: string) {
  if (!VALID_IDENTIFIER_REGEX.test(identifier)) {
    throw new Error(`Unsupported identifier: ${identifier}`);
  }

  return `"${identifier}"`;
}
