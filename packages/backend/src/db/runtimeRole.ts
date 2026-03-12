import { type Sql } from 'postgres';
import { quoteIdentifier } from './maintenance';

export type RuntimeRoleConfig = {
  password: string;
  roleName: string;
};

type DatabaseIdentityRow = {
  currentDatabase: string;
  currentUser: string;
};

type RoleExistsRow = {
  exists: boolean;
};

function readEnvValue(name: 'APP_DB_PASSWORD' | 'APP_DB_USER') {
  return process.env[name] ?? '';
}

function readTrimmedEnvValue(name: 'APP_DB_PASSWORD' | 'APP_DB_USER') {
  return readEnvValue(name).trim();
}

function decodeUrlCredential(value: string | undefined) {
  return value ? decodeURIComponent(value) : '';
}

function getFirstNonEmptyValue(values: readonly string[]) {
  for (const value of values) {
    if (value !== '') {
      return value;
    }
  }

  return '';
}

function parseAppDatabaseUrl() {
  const appDatabaseUrl = process.env.APP_DATABASE_URL;
  return appDatabaseUrl ? new URL(appDatabaseUrl) : null;
}

export function getRuntimeRoleConfigFromEnv(): RuntimeRoleConfig | null {
  const parsedUrl = parseAppDatabaseUrl();
  const roleName = getFirstNonEmptyValue([
    readTrimmedEnvValue('APP_DB_USER'),
    decodeUrlCredential(parsedUrl?.username),
  ]);
  const password = getFirstNonEmptyValue([
    readEnvValue('APP_DB_PASSWORD'),
    decodeUrlCredential(parsedUrl?.password),
  ]);

  if (roleName === '' || password === '') {
    return null;
  }

  return { password, roleName };
}

export async function ensureRuntimeRole(
  sql: Sql<Record<string, unknown>>,
  config: RuntimeRoleConfig,
) {
  const [identity] = await sql<DatabaseIdentityRow[]>`
    select current_database() as "currentDatabase", current_user as "currentUser"
  `;
  const [roleExists] = await sql<RoleExistsRow[]>`
    select exists(select 1 from pg_roles where rolname = ${config.roleName}) as "exists"
  `;

  const roleIdentifier = quoteIdentifier(config.roleName);
  const databaseIdentifier = quoteIdentifier(identity.currentDatabase);
  const ownerIdentifier = quoteIdentifier(identity.currentUser);

  if (roleExists?.exists) {
    await sql.unsafe(`alter role ${roleIdentifier} with login password $1`, [config.password]);
  } else {
    await sql.unsafe(`create role ${roleIdentifier} login password $1`, [config.password]);
  }

  await sql.unsafe(`grant connect on database ${databaseIdentifier} to ${roleIdentifier}`);
  await sql`revoke create on schema public from public`;
  await sql.unsafe(`grant usage on schema public to ${roleIdentifier}`);
  await sql.unsafe(`revoke all privileges on all tables in schema public from ${roleIdentifier}`);
  await sql.unsafe(
    `grant select, insert, update, delete on all tables in schema public to ${roleIdentifier}`,
  );
  await sql.unsafe(
    `revoke all privileges on all sequences in schema public from ${roleIdentifier}`,
  );
  await sql.unsafe(`grant usage, select on all sequences in schema public to ${roleIdentifier}`);
  await sql.unsafe(
    `alter default privileges for role ${ownerIdentifier} in schema public grant select, insert, update, delete on tables to ${roleIdentifier}`,
  );
  await sql.unsafe(
    `alter default privileges for role ${ownerIdentifier} in schema public grant usage, select on sequences to ${roleIdentifier}`,
  );
}
