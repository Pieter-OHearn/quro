import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { randomBytes } from 'node:crypto';
import { appendFileSync, cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import postgres from 'postgres';
import {
  DEFAULT_MIGRATIONS_FOLDER,
  MIGRATION_LOCK,
  migrateDatabase,
  type MigrateOptions,
} from '../db/migrateDatabase';
import { BUNDLED_MIGRATIONS } from '../db/schemaVersion';
import { applyTestSettings, writeTestSecret } from '../test/config';
import { runMigrateCommand } from './migrate';

// `quro migrate` against fresh databases on the test server: dry runs, repeated, concurrent and
// interrupted runs, refusals and exit codes. Every database and role here is created by the test
// with a random name and dropped afterwards. Passwords are synthetic.

const BACKEND_ROOT = join(import.meta.dir, '../..');
const serverUrl = new URL(process.env.DATABASE_URL!);
const suffix = randomBytes(4).toString('hex');
const server = postgres(serverUrl.toString(), { max: 2, onnotice: () => undefined });
const createdDatabases: string[] = [];
const createdRoles: string[] = [];
const BUNDLED = BUNDLED_MIGRATIONS.length;

function urlFor(database: string, user?: string, password?: string): string {
  const url = new URL(serverUrl.toString());
  url.pathname = `/${database}`;
  if (user) url.username = user;
  if (password) url.password = password;
  return url.toString();
}

async function freshDatabase(label: string, owner?: string): Promise<string> {
  const name = `quro_migrate_${label}_${suffix}`;
  await server.unsafe(`create database ${name}${owner ? ` owner ${owner}` : ''}`);
  createdDatabases.push(name);
  return name;
}

async function freshRole(
  label: string,
  options = 'login',
): Promise<{ name: string; password: string }> {
  const name = `quro_migrate_${label}_${suffix}`;
  const password = randomBytes(12).toString('hex');
  await server.unsafe(`create role ${name} ${options} password '${password}'`);
  createdRoles.push(name);
  return { name, password };
}

async function withDatabase<T>(database: string, work: (sql: postgres.Sql) => Promise<T>) {
  const sql = postgres(urlFor(database), { max: 1, onnotice: () => undefined });
  try {
    return await work(sql);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

const appliedCount = (database: string) =>
  withDatabase(database, async (sql) => {
    const [row] = await sql<{ exists: boolean }[]>`
      select to_regclass('drizzle.__drizzle_migrations') is not null as "exists"
    `;
    if (!row?.exists) return 0;
    const [count] = await sql<{ count: number }[]>`
      select count(*)::int as count from drizzle.__drizzle_migrations
    `;
    return count!.count;
  });

const tableExists = (database: string, table: string) =>
  withDatabase(database, async (sql) => {
    const [row] = await sql<
      { exists: boolean }[]
    >`select to_regclass(${table}) is not null as "exists"`;
    return Boolean(row?.exists);
  });

const roleExists = async (role: string) => {
  const [row] = await server<{ exists: boolean }[]>`
    select exists(select 1 from pg_roles where rolname = ${role}) as "exists"
  `;
  return Boolean(row?.exists);
};

const passwordHash = async (role: string) => {
  const [row] = await server<{ hash: string | null }[]>`
    select rolpassword as hash from pg_authid where rolname = ${role}
  `;
  return row?.hash ?? null;
};

type Run = { exitCode: number; out: string; stdout: string };

/** `quro migrate` in a child process, configured only through the environment. */
async function quroMigrate(env: Record<string, string>, ...args: string[]): Promise<Run> {
  const child = Bun.spawn([process.execPath, 'src/cli/quro.ts', 'migrate', ...args], {
    cwd: BACKEND_ROOT,
    env: { ...process.env, NODE_ENV: 'test', ...env },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { exitCode, out: `${stdout}\n${stderr}`, stdout };
}

function startQuroMigrate(env: Record<string, string>) {
  return Bun.spawn([process.execPath, 'src/cli/quro.ts', 'migrate'], {
    cwd: BACKEND_ROOT,
    env: { ...process.env, NODE_ENV: 'test', ...env },
    stdout: 'pipe',
    stderr: 'pipe',
  });
}

function settingsFor(
  database: string,
  admin?: { name: string; password: string },
  app?: { name: string; password: string },
) {
  const adminUrl = admin ? urlFor(database, admin.name, admin.password) : urlFor(database);
  return {
    DATABASE_URL: adminUrl,
    ADMIN_DATABASE_URL: adminUrl,
    APP_DATABASE_URL: app ? urlFor(database, app.name, app.password) : adminUrl,
  };
}

async function waitFor(condition: () => Promise<boolean>, what: string, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await condition()) return;
    await Bun.sleep(50);
  }
  throw new Error(`Timed out waiting for ${what}`);
}

const waitingForMigrationLock = (database: string) => async () => {
  const [row] = await server<{ waiting: number }[]>`
    select count(*)::int as waiting
      from pg_locks l join pg_database d on d.oid = l.database
     where l.locktype = 'advisory' and not l.granted and d.datname = ${database}
       and l.classid = ${MIGRATION_LOCK.classId} and l.objid = ${MIGRATION_LOCK.objectId}
  `;
  return row!.waiting;
};

beforeAll(() => {
  expect(serverUrl.protocol).toMatch(/^postgres/);
});

afterAll(async () => {
  for (const database of createdDatabases) {
    await server.unsafe(`drop database if exists ${database} with (force)`);
  }
  for (const role of createdRoles.reverse()) await server.unsafe(`drop role if exists ${role}`);
  await server.end({ timeout: 5 });
});

describe('quro migrate on a new database', () => {
  let database: string;
  let app: { name: string; password: string };
  let env: Record<string, string>;

  beforeAll(async () => {
    database = await freshDatabase('fresh');
    app = { name: `quro_migrate_app_${suffix}`, password: randomBytes(12).toString('hex') };
    createdRoles.push(app.name);
    env = settingsFor(database, undefined, app);
  });

  test('--dry-run prints the plan and changes nothing', async () => {
    const run = await quroMigrate(env, '--dry-run');
    expect(run.exitCode).toBe(0);
    expect(run.out).toContain(`Schema: ${BUNDLED} pending migration(s)`);
    expect(run.out).toContain(`Runtime role: create ${app.name}`);
    expect(run.out).toContain('Dry run: nothing was changed.');
    expect(await appliedCount(database)).toBe(0);
    expect(await tableExists(database, 'drizzle.__drizzle_migrations')).toBe(false);
    expect(await roleExists(app.name)).toBe(false);
  });

  test('applies every migration, creates the runtime role and never prints a password', async () => {
    const run = await quroMigrate(env);
    expect(run.exitCode).toBe(0);
    expect(run.out).toContain(`Applied ${BUNDLED} migration(s)`);
    expect(run.out).toContain(`Created the runtime role ${app.name}.`);
    expect(run.out).not.toContain(app.password);
    expect(run.out).not.toContain('postgres://');
    expect(await appliedCount(database)).toBe(BUNDLED);
    expect(await roleExists(app.name)).toBe(true);
  });

  test('a second run changes nothing and keeps the role password', async () => {
    const before = await passwordHash(app.name);
    const run = await quroMigrate(env);
    expect(run.exitCode).toBe(0);
    expect(run.out).toContain('Schema: up to date');
    expect(run.out).toContain('No migrations to apply.');
    expect(run.out).toContain(`Runtime role: ${app.name} signs in; apply grants only.`);
    expect(await appliedCount(database)).toBe(BUNDLED);
    expect(await passwordHash(app.name)).toBe(before);
  });

  test('the runtime role can read the migration history for readiness, and has no DDL', async () => {
    const sql = postgres(urlFor(database, app.name, app.password), { max: 1 });
    try {
      const [row] = await sql<{ count: number }[]>`
        select count(*)::int as count from drizzle.__drizzle_migrations
      `;
      expect(row!.count).toBe(BUNDLED);
      const denied = await sql`create table runtime_must_not_create (id int)`.then(
        () => null,
        (error: unknown) => error,
      );
      expect(denied).toMatchObject({ code: '42501' });
    } finally {
      await sql.end({ timeout: 5 });
    }
  });
});

type StatusReport = {
  status: string;
  compatible: boolean;
  message: string;
  exitCode: number;
  database: { host: string; port: number; name: string; user: string; serverVersion: string };
  applied: { migrations: number; latestMigration: string | null };
  pending: string[];
};

const statusOf = (run: Run) => JSON.parse(run.stdout) as StatusReport;

describe('quro migrate --status', () => {
  let database: string;
  let env: Record<string, string>;
  const newest = BUNDLED_MIGRATIONS.at(-1)!;

  beforeAll(async () => {
    database = await freshDatabase('status');
    env = settingsFor(database);
  });

  test('reports an empty database with every migration pending and changes nothing', async () => {
    const run = await quroMigrate(env, '--status', '--json');
    expect(run.exitCode).toBe(1);
    const report = statusOf(run);
    expect(report).toMatchObject({
      status: 'empty',
      compatible: false,
      exitCode: 1,
      database: { name: database },
      applied: { migrations: 0, latestMigration: null },
    });
    expect(report.pending).toEqual(BUNDLED_MIGRATIONS.map((migration) => migration.tag));
    expect(report.message).toContain('quro migrate');
    expect(await tableExists(database, 'drizzle.__drizzle_migrations')).toBe(false);
  });

  test('reports a current schema with exit code 0, as JSON and as text', async () => {
    expect((await quroMigrate(env)).exitCode).toBe(0);
    const run = await quroMigrate(env, '--status', '--json');
    expect(run.exitCode).toBe(0);
    expect(statusOf(run)).toEqual({
      status: 'current',
      compatible: true,
      message: `The database schema matches this image (${newest.tag}).`,
      exitCode: 0,
      database: {
        host: serverUrl.hostname,
        port: Number(serverUrl.port || '5432'),
        name: database,
        user: decodeURIComponent(serverUrl.username),
        serverVersion: expect.any(String),
      },
      applied: { migrations: BUNDLED, latestMigration: newest.tag },
      pending: [],
    });
    expect(run.stdout).not.toContain('postgres://');

    const text = await quroMigrate(env, '--status');
    expect(text.exitCode).toBe(0);
    expect(text.stdout).toContain(`Applied: ${BUNDLED} migration(s), newest ${newest.tag}.`);
    expect(text.stdout).toContain('Status: current.');
  });

  test('reports a schema behind the image with the pending migrations (exit code 1)', async () => {
    const latest = await withDatabase(database, async (sql) => {
      const [row] = await sql<{ id: number }[]>`
        delete from drizzle.__drizzle_migrations
         where id = (select max(id) from drizzle.__drizzle_migrations) returning id
      `;
      return row!.id;
    });
    try {
      const run = await quroMigrate(env, '--status', '--json');
      expect(run.exitCode).toBe(1);
      expect(statusOf(run)).toMatchObject({
        status: 'behind',
        compatible: false,
        applied: { migrations: BUNDLED - 1, latestMigration: BUNDLED_MIGRATIONS.at(-2)!.tag },
        pending: [newest.tag],
      });
    } finally {
      await withDatabase(
        database,
        (sql) =>
          sql`insert into drizzle.__drizzle_migrations (id, hash, created_at) values (${latest}, 'restored', ${newest.when})`,
      );
    }
  });

  test('reports a schema newer than the image, or unknown to it, as refused (exit code 3)', async () => {
    // Newer: a migration after the newest one this image ships. Unknown: the newest applied
    // migration is not in this image's journal (another build migrated the database).
    const cases = [
      {
        status: 'ahead',
        change: (sql: postgres.Sql) =>
          sql`insert into drizzle.__drizzle_migrations (hash, created_at) values ('other-image', ${newest.when + 1})`,
        undo: (sql: postgres.Sql) =>
          sql`delete from drizzle.__drizzle_migrations where hash = 'other-image'`,
        applied: BUNDLED + 1,
      },
      {
        status: 'unknown',
        change: (sql: postgres.Sql) =>
          sql`update drizzle.__drizzle_migrations set created_at = ${newest.when - 1} where created_at = ${newest.when}`,
        undo: (sql: postgres.Sql) =>
          sql`update drizzle.__drizzle_migrations set created_at = ${newest.when} where created_at = ${newest.when - 1}`,
        applied: BUNDLED,
      },
    ];
    for (const { status, change, undo, applied } of cases) {
      await withDatabase(database, change);
      try {
        const run = await quroMigrate(env, '--status', '--json');
        expect(run.exitCode).toBe(3);
        expect(statusOf(run)).toMatchObject({
          status,
          compatible: false,
          exitCode: 3,
          applied: { migrations: applied, latestMigration: null },
          pending: [],
        });
        // `quro migrate` refuses the same schema and leaves it alone.
        const refused = await quroMigrate(env);
        expect(refused.exitCode).toBe(3);
        expect(await appliedCount(database)).toBe(applied);
      } finally {
        await withDatabase(database, undo);
      }
    }
  });

  test('needs only the owner role, and never prints its password', async () => {
    // An owner with a random password and no runtime role or runtime password file at all.
    const owner = await freshRole('statusowner', 'login');
    const owned = await freshDatabase('statusowned', owner.name);
    const run = await quroMigrate(
      {
        DATABASE_URL: '',
        ADMIN_DATABASE_URL: '',
        APP_DATABASE_URL: '',
        POSTGRES_HOST: serverUrl.hostname,
        POSTGRES_PORT: serverUrl.port || '5432',
        POSTGRES_DB: owned,
        POSTGRES_ADMIN_USER: owner.name,
        POSTGRES_ADMIN_PASSWORD_FILE: writeTestSecret(`status-owner-${suffix}`, owner.password),
        POSTGRES_APP_PASSWORD_FILE: '/nonexistent/postgres_app_password',
      },
      '--status',
      '--json',
    );
    expect(run.exitCode).toBe(1);
    expect(statusOf(run)).toMatchObject({ status: 'empty', database: { user: owner.name } });
    expect(run.out).not.toContain(owner.password);
  });

  test('an unreachable database exits 4 and prints no report; usage mistakes exit 2', async () => {
    const unreachable = new URL(serverUrl.toString());
    unreachable.port = '1';
    unreachable.pathname = `/${database}`;
    const run = await quroMigrate(
      { DATABASE_URL: unreachable.toString(), ADMIN_DATABASE_URL: unreachable.toString() },
      '--status',
      '--json',
    );
    expect(run.exitCode).toBe(4);
    expect(run.stdout.trim()).toBe('');
    expect(run.out).toContain('cannot be reached');
    expect((await quroMigrate(env, '--status', '--dry-run')).exitCode).toBe(2);
    expect((await quroMigrate(env, '--json')).exitCode).toBe(2);
  });
});

describe('concurrent and interrupted runs', () => {
  test('concurrent runs wait for the lock; both succeed and each migration is applied once', async () => {
    const database = await freshDatabase('concurrent');
    const env = settingsFor(database);
    // Hold the lock so both runs are certainly waiting at the same time.
    const holderDatabase = postgres(urlFor(database), { max: 1 });
    try {
      await holderDatabase`select pg_advisory_lock(${MIGRATION_LOCK.classId}, ${MIGRATION_LOCK.objectId})`;
      const first = startQuroMigrate(env);
      const second = startQuroMigrate(env);
      await waitFor(
        async () => (await waitingForMigrationLock(database)()) === 2,
        'two waiting runs',
      );
      await holderDatabase`select pg_advisory_unlock(${MIGRATION_LOCK.classId}, ${MIGRATION_LOCK.objectId})`;
      const outputs = await Promise.all(
        [first, second].map(async (child) => ({
          exitCode: await child.exited,
          out: await new Response(child.stdout).text(),
        })),
      );
      expect(outputs.map((output) => output.exitCode)).toEqual([0, 0]);
      for (const output of outputs) expect(output.out).toContain('waiting for it to finish');
      expect(
        outputs.filter((output) => output.out.includes(`Applied ${BUNDLED} migration(s)`)),
      ).toHaveLength(1);
      expect(
        outputs.filter((output) => output.out.includes('No migrations to apply.')),
      ).toHaveLength(1);
      expect(await appliedCount(database)).toBe(BUNDLED);
    } finally {
      await holderDatabase.end({ timeout: 5 });
    }
  });

  test('a run killed part way applies nothing, and the next run completes', async () => {
    const database = await freshDatabase('interrupted');
    const env = settingsFor(database);
    const blocker = postgres(urlFor(database), { max: 1, onnotice: () => undefined });
    try {
      // The migrator records each migration after running its statements. A SHARE lock on the
      // history table lets it read and run the first migration, then blocks the record: the run
      // is stopped in the middle of its transaction.
      await blocker`create schema if not exists drizzle`;
      await blocker`create table if not exists drizzle.__drizzle_migrations (id serial primary key, hash text not null, created_at bigint)`;
      await blocker`begin`;
      await blocker`lock table drizzle.__drizzle_migrations in share mode`;
      const child = startQuroMigrate(env);
      let backendPid = 0;
      await waitFor(async () => {
        backendPid = await withDatabase(database, async (sql) => {
          const [row] = await sql<{ pid: number }[]>`
            select pid from pg_locks
             where relation = 'drizzle.__drizzle_migrations'::regclass and not granted
          `;
          return row?.pid ?? 0;
        });
        return backendPid > 0;
      }, 'the run to block on recording its first migration');
      expect(await tableExists(database, 'public.users')).toBe(false); // not visible: uncommitted
      child.kill('SIGKILL');
      await child.exited;
      await server`select pg_terminate_backend(${backendPid})`;
      await blocker`commit`;

      expect(await appliedCount(database)).toBe(0);
      expect(await tableExists(database, 'public.users')).toBe(false);

      const rerun = await quroMigrate(env);
      expect(rerun.exitCode).toBe(0);
      expect(rerun.out).not.toContain('waiting for it to finish');
      expect(await appliedCount(database)).toBe(BUNDLED);
      expect(await tableExists(database, 'public.users')).toBe(true);
    } finally {
      await blocker.end({ timeout: 5 });
    }
  });
});

describe('refusals and exit codes', () => {
  const quiet = (overrides: Partial<MigrateOptions> & Pick<MigrateOptions, 'adminUrl'>) => {
    const lines: string[] = [];
    const options: MigrateOptions = {
      target: { host: 'test', port: 5432, database: 'test', user: 'test' },
      runtime: null,
      dryRun: false,
      print: (line) => lines.push(line),
      connectAttempts: 1,
      ...overrides,
    };
    return { lines, run: () => migrateDatabase(options) };
  };

  test('a schema newer than the image is refused with exit code 3 and left alone', async () => {
    const database = await freshDatabase('ahead');
    const env = settingsFor(database);
    expect((await quroMigrate(env)).exitCode).toBe(0);
    const newest = BUNDLED_MIGRATIONS.at(-1)!;
    await withDatabase(
      database,
      (sql) =>
        sql`insert into drizzle.__drizzle_migrations (hash, created_at) values ('later-image', ${newest.when + 1})`,
    );
    const run = await quroMigrate(env);
    expect(run.exitCode).toBe(3);
    expect(run.out).toContain('newer than this image');
    expect(await appliedCount(database)).toBe(BUNDLED + 1);
  });

  test('an owner that can neither create the runtime role nor use one is refused before any change', async () => {
    const owner = await freshRole('owner', 'login nocreaterole');
    const database = await freshDatabase('nocreaterole', owner.name);
    const app = {
      name: `quro_migrate_preset_${suffix}`,
      password: randomBytes(12).toString('hex'),
    };
    createdRoles.push(app.name);
    const env = settingsFor(database, owner, app);

    const refused = await quroMigrate(env);
    expect(refused.exitCode).toBe(3);
    expect(refused.out).toContain('cannot create roles');
    expect(await tableExists(database, 'drizzle.__drizzle_migrations')).toBe(false);

    // A runtime role created by the database administrator: migrate applies grants only.
    await server.unsafe(`create role ${app.name} login password '${app.password}'`);
    const run = await quroMigrate(env);
    expect(run.exitCode).toBe(0);
    expect(run.out).toContain('apply grants only');
    expect(await appliedCount(database)).toBe(BUNDLED);
  });

  test('a runtime role step that fails after the migrations says the schema is migrated', async () => {
    const database = await freshDatabase('rolestep');
    const lines: string[] = [];
    const outcome = await migrateDatabase({
      adminUrl: urlFor(database),
      target: { host: 'test', port: 5432, database, user: 'test' },
      // Not a valid role identifier: the role step refuses to build SQL with it.
      runtime: { user: 'not-a-valid-identifier', url: urlFor(database), password: 'unused' },
      dryRun: false,
      print: (line) => lines.push(line),
      connectAttempts: 1,
    });
    expect(outcome.kind).toBe('failed');
    expect('message' in outcome && outcome.message).toContain('The schema is migrated');
    expect(await appliedCount(database)).toBe(BUNDLED);
  });

  test('an owner that does not own the database is refused with exit code 3', async () => {
    const outsider = await freshRole('outsider');
    const database = await freshDatabase('notowner');
    const run = await quroMigrate(settingsFor(database, outsider));
    expect(run.exitCode).toBe(3);
    expect(run.out).toContain('does not own the database');
    expect(await appliedCount(database)).toBe(0);
  });

  test('an unreachable server ends with exit code 4, a rejected password with 2', async () => {
    const unreachable = new URL(serverUrl.toString());
    unreachable.port = '1';
    const offline = quiet({ adminUrl: unreachable.toString() });
    expect(await offline.run()).toMatchObject({ kind: 'unreachable' });

    const wrong = new URL(serverUrl.toString());
    wrong.password = 'not-the-password';
    const rejected = quiet({ adminUrl: wrong.toString() });
    expect(await rejected.run()).toMatchObject({ kind: 'rejected' });

    const restore = applyTestSettings({ ADMIN_DATABASE_URL: unreachable.toString() });
    try {
      const lines: string[] = [];
      const io = {
        out: (line: string) => lines.push(line),
        err: (line: string) => lines.push(line),
      };
      expect(await runMigrateCommand([], io, { connectAttempts: 1, runtimeRole: false })).toBe(4);
      expect(lines.join('\n')).toContain('cannot be reached');
      expect(lines.join('\n')).not.toContain('postgres://');
    } finally {
      restore();
    }
  });

  test('a migration that fails applies none of the run, and a corrected run completes', async () => {
    const database = await freshDatabase('failing');
    // The image's migrations, with the newest one ending in a statement that fails: the run
    // applies every earlier migration first, inside the same transaction.
    const folder = mkdtempSync(join(tmpdir(), 'quro-failing-migrations-'));
    try {
      cpSync(DEFAULT_MIGRATIONS_FOLDER, folder, { recursive: true });
      appendFileSync(
        join(folder, `${BUNDLED_MIGRATIONS.at(-1)!.tag}.sql`),
        '\n--> statement-breakpoint\nselect * from quro_migrate_missing_relation;\n',
      );
      const failed = quiet({ adminUrl: urlFor(database), migrationsFolder: folder });
      const outcome = await failed.run();
      expect(outcome.kind).toBe('failed');
      expect('message' in outcome && outcome.message).toContain(
        'relation "quro_migrate_missing_relation" does not exist (SQLSTATE 42P01)',
      );
      expect('message' in outcome && outcome.message).toContain('none from this run was recorded');
      expect(await appliedCount(database)).toBe(0);
      expect(await tableExists(database, 'public.users')).toBe(false);

      const corrected = quiet({ adminUrl: urlFor(database) });
      expect(await corrected.run()).toEqual({ kind: 'ok' });
      expect(await appliedCount(database)).toBe(BUNDLED);
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });

  test('invalid settings end with exit code 2 before connecting', async () => {
    const run = await quroMigrate({
      DATABASE_URL: '',
      ADMIN_DATABASE_URL: '',
      APP_DATABASE_URL: '',
      POSTGRES_HOST: '',
    });
    expect(run.exitCode).toBe(2);
    expect(run.out).toContain('POSTGRES_HOST');
  });
});
