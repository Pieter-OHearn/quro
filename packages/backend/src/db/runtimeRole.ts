import { type Sql } from 'postgres';
import { getConfig } from '../config';
import { quoteIdentifier } from './maintenance';

function escapeLiteral(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "''");
}

function toLiteral(value: string) {
  return `'${escapeLiteral(value)}'`;
}

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

/** The runtime role the application connects as, or null when its credentials are not set. */
export function getRuntimeRoleConfig(): RuntimeRoleConfig | null {
  const { user, password } = getConfig().runtimeDatabase;
  const secret = password.reveal();
  if (user === '' || secret === '') return null;
  return { password: secret, roleName: user };
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
  const roleSql = sql.unsafe(roleIdentifier);
  const databaseSql = sql.unsafe(databaseIdentifier);
  const ownerSql = sql.unsafe(ownerIdentifier);
  const passwordLiteral = toLiteral(config.password);

  if (roleExists?.exists) {
    await sql.unsafe(`alter role ${roleIdentifier} with login password ${passwordLiteral}`);
  } else {
    await sql.unsafe(`create role ${roleIdentifier} login password ${passwordLiteral}`);
  }

  await sql`grant connect on database ${databaseSql} to ${roleSql}`;
  await sql`revoke create on schema public from public`;
  await sql`grant usage on schema public to ${roleSql}`;
  await sql`revoke all privileges on all tables in schema public from ${roleSql}`;
  await sql`grant select, insert, update, delete on all tables in schema public to ${roleSql}`;
  await sql`revoke all privileges on all sequences in schema public from ${roleSql}`;
  await sql`grant usage, select on all sequences in schema public to ${roleSql}`;
  await sql`alter default privileges for role ${ownerSql} in schema public grant select, insert, update, delete on tables to ${roleSql}`;
  await sql`alter default privileges for role ${ownerSql} in schema public grant usage, select on sequences to ${roleSql}`;
}
