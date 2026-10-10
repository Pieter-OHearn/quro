import postgres, { type Sql } from 'postgres';
import { getConfig } from '../config';
import { quoteIdentifier } from './maintenance';
import { serverMajorFromVersionNum } from './pgTools';

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

type AdminSql = Sql<Record<string, unknown>>;

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

/**
 * Data access for the runtime role: tables and sequences in `public`, and read access to the
 * migration history so readiness can compare the schema with the image. No DDL. Applying them
 * again changes nothing.
 */
export async function applyRuntimeGrants(sql: AdminSql, roleName: string) {
  const [identity] = await sql<DatabaseIdentityRow[]>`
    select current_database() as "currentDatabase", current_user as "currentUser"
  `;
  const roleSql = sql.unsafe(quoteIdentifier(roleName));
  const databaseSql = sql.unsafe(quoteIdentifier(identity!.currentDatabase));
  const ownerSql = sql.unsafe(quoteIdentifier(identity!.currentUser));

  await sql`grant connect on database ${databaseSql} to ${roleSql}`;
  await sql`revoke create on schema public from public`;
  await sql`grant usage on schema public to ${roleSql}`;
  await sql`revoke all privileges on all tables in schema public from ${roleSql}`;
  await sql`grant select, insert, update, delete on all tables in schema public to ${roleSql}`;
  await sql`revoke all privileges on all sequences in schema public from ${roleSql}`;
  await sql`grant usage, select on all sequences in schema public to ${roleSql}`;
  await sql`alter default privileges for role ${ownerSql} in schema public grant select, insert, update, delete on tables to ${roleSql}`;
  await sql`alter default privileges for role ${ownerSql} in schema public grant usage, select on sequences to ${roleSql}`;
  const [history] = await sql<{ exists: boolean }[]>`
    select to_regclass('drizzle.__drizzle_migrations') is not null as "exists"
  `;
  if (history?.exists) {
    await sql`grant usage on schema drizzle to ${roleSql}`;
    await sql`grant select on drizzle.__drizzle_migrations to ${roleSql}`;
  }
}

export async function createRuntimeRole(sql: AdminSql, config: RuntimeRoleConfig) {
  await sql.unsafe(
    `create role ${quoteIdentifier(config.roleName)} login password ${toLiteral(config.password)}`,
  );
}

export async function setRuntimePassword(sql: AdminSql, config: RuntimeRoleConfig) {
  await sql.unsafe(
    `alter role ${quoteIdentifier(config.roleName)} with login password ${toLiteral(config.password)}`,
  );
}

/** Creates the role or resets its password, then applies the grants (`db:bootstrap-runtime-role`). */
export async function ensureRuntimeRole(sql: AdminSql, config: RuntimeRoleConfig) {
  const [roleExists] = await sql<RoleExistsRow[]>`
    select exists(select 1 from pg_roles where rolname = ${config.roleName}) as "exists"
  `;
  await (roleExists?.exists ? setRuntimePassword(sql, config) : createRuntimeRole(sql, config));
  await applyRuntimeGrants(sql, config.roleName);
}

/** What the owner role may do, read before anything changes. */
export type OwnerFacts = {
  owner: string;
  database: string;
  serverVersion: string;
  serverMajor: number;
  superuser: boolean;
  createRole: boolean;
  ownsDatabase: boolean;
};

type OwnerFactsRow = Omit<OwnerFacts, 'serverMajor'> & { serverVersionNum: number };

export async function readOwnerFacts(sql: AdminSql): Promise<OwnerFacts> {
  const [row] = await sql<OwnerFactsRow[]>`
    select current_user as "owner",
           current_database() as "database",
           current_setting('server_version') as "serverVersion",
           current_setting('server_version_num')::int as "serverVersionNum",
           r.rolsuper as "superuser",
           r.rolcreaterole as "createRole",
           d.datdba = r.oid as "ownsDatabase"
      from pg_roles r, pg_database d
     where r.rolname = current_user and d.datname = current_database()
  `;
  if (!row) throw new Error('Could not read the owner role.');
  const { serverVersionNum, ...facts } = row;
  return { ...facts, serverMajor: serverMajorFromVersionNum(serverVersionNum) };
}

export type RuntimeRolePlan =
  /** The runtime connection uses the owner role (development URLs): nothing to do. */
  | { action: 'skip' }
  | { action: 'create' }
  /** The role exists and its password does not sign in; the owner may change it. */
  | { action: 'set-password' }
  /** The role exists and signs in with the secret file: only the grants are applied. */
  | { action: 'grants' }
  /** Nothing the owner may do makes the role usable; a person has to act (exit code 3). */
  | { action: 'refuse'; reason: string };

/** Whether a connection URL signs in; throws when the server cannot be reached. */
export type SignInCheck = (url: string) => Promise<boolean>;

const SIGN_IN_TIMEOUT_SECONDS = 10;
const CLOSE_TIMEOUT_SECONDS = 5;
const AUTH_FAILURE_CODES = new Set(['28P01', '28000']);

export const checkSignIn: SignInCheck = async (url) => {
  const client = postgres(url, {
    max: 1,
    connect_timeout: SIGN_IN_TIMEOUT_SECONDS,
    onnotice: () => undefined,
  });
  try {
    await client`select 1`;
    return true;
  } catch (error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === 'string' && AUTH_FAILURE_CODES.has(code)) return false;
    throw error;
  } finally {
    await client.end({ timeout: CLOSE_TIMEOUT_SECONDS });
  }
};

// From PostgreSQL 16, CREATEROLE only covers roles the owner holds ADMIN OPTION on.
const ROLE_ADMIN_OPTION_MAJOR = 16;

async function canChangeRole(sql: AdminSql, owner: OwnerFacts, roleName: string) {
  if (owner.superuser) return true;
  if (!owner.createRole) return false;
  if (owner.serverMajor < ROLE_ADMIN_OPTION_MAJOR) return true;
  const [row] = await sql<{ admin: boolean }[]>`
    select pg_has_role(current_user, ${roleName}, 'MEMBER WITH ADMIN OPTION') as "admin"
  `;
  return Boolean(row?.admin);
}

/**
 * Decides what `quro migrate` does about the runtime role, without changing anything. A role
 * that already signs in with the secret file keeps its password, so a second run changes nothing
 * and an owner without CREATEROLE can use a role created for it.
 */
export async function planRuntimeRole(
  sql: AdminSql,
  owner: OwnerFacts,
  runtime: { user: string; url: string },
  signIn: SignInCheck = checkSignIn,
): Promise<RuntimeRolePlan> {
  if (runtime.user === owner.owner) return { action: 'skip' };
  const [role] = await sql<RoleExistsRow[]>`
    select exists(select 1 from pg_roles where rolname = ${runtime.user}) as "exists"
  `;
  if (!role?.exists) {
    if (owner.superuser || owner.createRole) return { action: 'create' };
    return {
      action: 'refuse',
      reason: `The runtime role ${runtime.user} does not exist and ${owner.owner} cannot create roles. Either grant ${owner.owner} CREATEROLE, or create ${runtime.user} yourself with LOGIN and the password in the runtime password file.`,
    };
  }
  if (await signIn(runtime.url)) return { action: 'grants' };
  if (await canChangeRole(sql, owner, runtime.user)) return { action: 'set-password' };
  return {
    action: 'refuse',
    reason: `The runtime role ${runtime.user} exists but does not sign in with the runtime password file, and ${owner.owner} may not change it. Give the role LOGIN and the password in that file yourself.`,
  };
}

export function describeRuntimeRolePlan(plan: RuntimeRolePlan, roleName: string): string {
  switch (plan.action) {
    case 'skip':
      return `Runtime role: the runtime connection uses the owner role; no role changes.`;
    case 'create':
      return `Runtime role: create ${roleName} with the password from its secret file, then apply grants.`;
    case 'set-password':
      return `Runtime role: set the password of ${roleName} from its secret file, then apply grants.`;
    case 'grants':
      return `Runtime role: ${roleName} signs in; apply grants only.`;
    case 'refuse':
      return `Runtime role: ${plan.reason}`;
  }
}

/** Carries out a plan that is not `refuse`; returns what it changed, for the command output. */
export async function applyRuntimeRolePlan(
  sql: AdminSql,
  plan: Exclude<RuntimeRolePlan, { action: 'refuse' }>,
  config: RuntimeRoleConfig,
): Promise<string[]> {
  if (plan.action === 'skip') return [];
  const changes: string[] = [];
  if (plan.action === 'create') {
    await createRuntimeRole(sql, config);
    changes.push(`Created the runtime role ${config.roleName}.`);
  } else if (plan.action === 'set-password') {
    await setRuntimePassword(sql, config);
    changes.push(`Set the password of ${config.roleName} from its secret file.`);
  }
  await applyRuntimeGrants(sql, config.roleName);
  changes.push(`Data-access grants for ${config.roleName} are in place.`);
  return changes;
}
