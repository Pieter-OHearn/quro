import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { migrateDatabase } from '../db/migrateDatabase';
import * as schema from '../db/schema';
import { generateTestSecretsKey } from '../test/config';
import {
  sealAllRows,
  SECRET_COLUMNS,
  secretPlace,
  type SecretField,
  type SecretRow,
} from './integrationSecrets';
import { enterMaintenance, leaveMaintenance, openMaintenanceSession } from './maintenanceMode';
import { classifySecret, openSecret, SecretsKey, type SecretsKeyring } from './secretEnvelope';

// The encryption of stored bank-link secrets, run against rows in the shape releases up to 0.8.0
// stored them (unencrypted text in bunq_connections), in a database created for this suite. The
// `quro secrets` commands run as separate processes, the way an operator runs them, so exit codes
// and printed output are checked as well. Synthetic values only; keys are random per run.

const BACKEND_DIR = join(import.meta.dir, '../..');
const serverUrl = new URL(process.env.DATABASE_URL!);
const suffix = randomBytes(4).toString('hex');
const databaseName = `quro_secrets_${suffix}`;
const server = postgres(serverUrl.toString(), { max: 1, onnotice: () => undefined });
const scratch = mkdtempSync(join(tmpdir(), 'quro-secrets-'));
const EMAIL_DOMAIN = 'secrets.integration.quro.test';

function databaseUrl(): string {
  const url = new URL(serverUrl.toString());
  url.pathname = `/${databaseName}`;
  return url.toString();
}

function writeKey(name: string): { path: string; key: SecretsKey } {
  const hex = generateTestSecretsKey();
  const path = join(scratch, name);
  writeFileSync(path, `${hex}\n`, { mode: 0o600 });
  return { path, key: SecretsKey.parse(hex) };
}

const first = writeKey('first_key');
const second = writeKey('second_key');
const unrelated = writeKey('unrelated_key');

let sql: postgres.Sql;
let database: ReturnType<typeof drizzle<typeof schema>>;

type Values = Partial<Record<SecretField, string>>;

// Markers of every synthetic plaintext value seeded, to search outputs and the database for.
const seededPlaintext = new Set<string>();

beforeAll(async () => {
  await server.unsafe(`create database ${databaseName}`);
  const outcome = await migrateDatabase({
    adminUrl: databaseUrl(),
    target: { host: 'test', port: 5432, database: databaseName, user: 'test' },
    runtime: null,
    dryRun: false,
    print: () => undefined,
    connectAttempts: 1,
  });
  if (outcome.kind !== 'ok') throw new Error(`migration failed: ${JSON.stringify(outcome)}`);
  sql = postgres(databaseUrl(), { max: 4, onnotice: () => undefined });
  database = drizzle(sql, { schema });
});

afterAll(async () => {
  await sql?.end({ timeout: 5 });
  await server.unsafe(`drop database if exists ${databaseName} with (force)`);
  await server.end({ timeout: 5 });
  rmSync(scratch, { recursive: true, force: true });
});

beforeEach(async () => {
  await sql`delete from bunq_connections`;
  await sql`delete from users where email like ${`%@${EMAIL_DOMAIN}`}`;
  seededPlaintext.clear();
});

async function insertUser(label: string): Promise<number> {
  const [row] = await sql<{ id: number }[]>`
    insert into users (first_name, last_name, email, password_hash)
    values ('Synthetic', ${label}, ${`${label}-${randomBytes(3).toString('hex')}@${EMAIL_DOMAIN}`}, 'synthetic-hash')
    returning id
  `;
  return row!.id;
}

/** Inserts one connection with the given (synthetic) column values, as 0.8.0 stored them. */
async function insertConnection(label: string, values: Values) {
  const userId = await insertUser(label);
  for (const value of Object.values(values)) {
    if (value && !value.startsWith('quro-secret:')) seededPlaintext.add(value);
  }
  await sql`
    insert into bunq_connections (user_id, access_token, private_key, installation_token,
      session_token, server_public_key, session_id, bunq_user_id, sync_status, sync_error)
    values (${userId}, ${values.accessToken ?? `synthetic-access-${label}`},
      ${values.privateKey ?? null}, ${values.installationToken ?? null},
      ${values.sessionToken ?? null}, ${'synthetic-server-public-key'}, ${7}, ${'4242'},
      ${'idle'}, ${null})
  `;
  seededPlaintext.add(values.accessToken ?? `synthetic-access-${label}`);
  return userId;
}

/** Three connections in the shapes a 0.8.0 instance holds: new, fully synced, session only. */
async function seedLegacyRows(count = 3): Promise<Map<number, Values>> {
  const seeded = new Map<number, Values>();
  for (let index = 0; index < count; index += 1) {
    const label = `legacy${index}`;
    const values: Values = { accessToken: `synthetic-access-${label}` };
    if (index % 3 === 1) {
      values.privateKey = `synthetic-private-key-${label}`;
      values.installationToken = `synthetic-installation-${label}`;
      values.sessionToken = `synthetic-session-${label}`;
    } else if (index % 3 === 2) {
      values.sessionToken = `synthetic-session-${label}`;
    }
    seeded.set(await insertConnection(label, values), values);
  }
  return seeded;
}

type Row = SecretRow & {
  serverPublicKey: string | null;
  sessionId: number | null;
  bunqUserId: string | null;
};

function readRows(): Promise<Row[]> {
  return sql<Row[]>`
    select id, user_id as "userId", access_token as "accessToken", private_key as "privateKey",
      installation_token as "installationToken", session_token as "sessionToken",
      server_public_key as "serverPublicKey", session_id as "sessionId", bunq_user_id as "bunqUserId"
    from bunq_connections order by id
  `;
}

/** Every column of every connection as text: what a dump of the table would hold. */
async function tableText(): Promise<string> {
  const rows = await sql<
    { text: string }[]
  >`select t::text as text from bunq_connections t order by id`;
  return rows.map((row) => row.text).join('\n');
}

function expectNoPlaintext(text: string): void {
  expect(seededPlaintext.size).toBeGreaterThan(0);
  for (const value of seededPlaintext) expect(text).not.toContain(value);
}

type Keys = { key?: string; previous?: string };

async function quro(args: string[], keys: Keys = {}) {
  const child = Bun.spawn([process.execPath, 'src/cli/quro.ts', 'secrets', ...args], {
    cwd: BACKEND_DIR,
    env: {
      ...process.env,
      NODE_ENV: 'development',
      DATABASE_URL: databaseUrl(),
      ADMIN_DATABASE_URL: databaseUrl(),
      APP_DATABASE_URL: databaseUrl(),
      QRO_DISABLE_SCHEDULERS: 'true',
      // An empty value counts as unset, so no key is read unless the test names one.
      QRO_SECRETS_KEY_FILE: keys.key ?? '',
      QRO_SECRETS_PREVIOUS_KEY_FILE: keys.previous ?? '',
    },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [out, err, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { exitCode, out, err, all: `${out}\n${err}` };
}

function keyringOf(...keys: SecretsKey[]): SecretsKeyring {
  return { current: keys[0] ?? null, previous: keys[1] ?? null };
}

/** Every stored secret opens with `keyring` to the value seeded for it. */
function expectOpensToSeeded(rows: Row[], seeded: Map<number, Values>, keyring: SecretsKeyring) {
  for (const row of rows) {
    const values = seeded.get(row.userId)!;
    for (const { column, field } of SECRET_COLUMNS) {
      const stored = row[field];
      if (values[field] === undefined) {
        expect(stored).toBeNull();
        continue;
      }
      expect(stored).not.toBe(values[field]);
      expect(openSecret(stored!, secretPlace(column, row.userId), keyring).value).toBe(
        values[field]!,
      );
    }
  }
}

/** Within each row, every stored secret is in one state: none half converted. */
function expectRowsWhole(rows: Row[]) {
  for (const row of rows) {
    const states = new Set(
      SECRET_COLUMNS.map(({ field }) => row[field])
        .filter((value): value is string => value !== null)
        .map((value) => value.startsWith('quro-secret:')),
    );
    expect(states.size).toBe(1);
  }
}

describe('quro secrets status before encryption', () => {
  test('reports the unencrypted secrets and the key id, and prints no value', async () => {
    await seedLegacyRows(3);
    const run = await quro(['status'], { key: first.path });
    expect(run.exitCode).toBe(1);
    expect(run.out).toContain(`Secrets key: ${first.key.id}`);
    expect(run.out).toContain('bunq connections: 3, holding 7 stored secret(s).');
    expect(run.out).toContain('  unencrypted: 7');
    expect(run.out).toContain('Status: unencrypted. Some secrets are stored unencrypted.');
    expectNoPlaintext(run.all);

    const json = await quro(['status', '--json'], { key: first.path });
    expect(json.exitCode).toBe(1);
    expect(JSON.parse(json.out)).toMatchObject({
      status: 'unencrypted',
      key: { configured: true, id: first.key.id },
      connections: 3,
      secrets: { total: 7, unencrypted: 7, current: 0 },
      exitCode: 1,
    });
  });

  test('without a key it says so and still changes nothing', async () => {
    await seedLegacyRows(2);
    const before = await tableText();
    const run = await quro(['status']);
    expect(run.exitCode).toBe(1);
    expect(run.out).toContain('Secrets key: not configured (QRO_SECRETS_KEY_FILE).');
    expect(await tableText()).toBe(before);
  });
});

describe('quro secrets encrypt', () => {
  test('without a key it exits 2 and changes nothing', async () => {
    await seedLegacyRows(2);
    const before = await tableText();
    const run = await quro(['encrypt']);
    expect(run.exitCode).toBe(2);
    expect(run.err).toContain('QRO_SECRETS_KEY_FILE: required for `quro secrets encrypt`');
    expect(await tableText()).toBe(before);
  });

  test('a dry run reports and changes nothing', async () => {
    await seedLegacyRows(2);
    const before = await tableText();
    const run = await quro(['encrypt', '--dry-run'], { key: first.path });
    expect(run.exitCode).toBe(0);
    expect(run.out).toContain(`Would encrypt 5 secret(s) with key ${first.key.id}.`);
    expect(await tableText()).toBe(before);
  });

  test('encrypts every row, keeps nulls and other columns, and a second run changes nothing', async () => {
    const seeded = await seedLegacyRows(6);
    const before = await readRows();
    const run = await quro(['encrypt'], { key: first.path });
    expect(run.exitCode).toBe(0);
    expect(run.out).toContain(
      `Encrypted 14 secret(s) in 6 bank connection(s) with key ${first.key.id}.`,
    );
    expect(run.out).toContain('Status: current.');
    expectNoPlaintext(run.all);

    const after = await readRows();
    expectOpensToSeeded(after, seeded, keyringOf(first.key));
    for (const [index, row] of after.entries()) {
      expect(row).toMatchObject({
        id: before[index]!.id,
        serverPublicKey: 'synthetic-server-public-key',
        sessionId: 7,
        bunqUserId: '4242',
      });
    }
    expectNoPlaintext(await tableText());

    const snapshot = await tableText();
    const again = await quro(['encrypt'], { key: first.path });
    expect(again.exitCode).toBe(0);
    expect(again.out).toContain('Nothing to encrypt.');
    expect(await tableText()).toBe(snapshot);
    expect((await quro(['status'], { key: first.path })).exitCode).toBe(0);
  });

  test('an interruption leaves each row as it was or fully converted, and a rerun finishes', async () => {
    const seeded = await seedLegacyRows(3);
    const keyring = { current: first.key, previous: null };
    let calls = 0;
    // The second row fails after its UPDATE, before its commit: a crash inside a row.
    await expect(
      sealAllRows(database, keyring, 'encrypt', {
        beforeCommit: () => {
          calls += 1;
          if (calls === 2) throw new Error('simulated interruption');
        },
      }),
    ).rejects.toThrow('simulated interruption');
    let rows = await readRows();
    expectRowsWhole(rows);
    expect(rows.map((row) => classifySecret(row.accessToken!, keyring))).toEqual([
      'current',
      'unencrypted',
      'unencrypted',
    ]);

    // A crash right after the next row's commit.
    await expect(
      sealAllRows(database, keyring, 'encrypt', {
        afterRow: (outcome) => {
          if (outcome.sealed.length > 0) throw new Error('simulated interruption');
        },
      }),
    ).rejects.toThrow('simulated interruption');
    rows = await readRows();
    expectRowsWhole(rows);
    expect(rows.map((row) => classifySecret(row.accessToken!, keyring))).toEqual([
      'current',
      'current',
      'unencrypted',
    ]);

    const resumed = await quro(['encrypt'], { key: first.path });
    expect(resumed.exitCode).toBe(0);
    expect(resumed.out).toContain('Encrypted 2 secret(s) in 1 bank connection(s)');
    expectOpensToSeeded(await readRows(), seeded, keyringOf(first.key));
  });

  test('a process killed part way never leaves a row half converted', async () => {
    const seeded = await seedLegacyRows(150);
    const child = Bun.spawn([process.execPath, 'src/cli/quro.ts', 'secrets', 'encrypt'], {
      cwd: BACKEND_DIR,
      env: {
        ...process.env,
        NODE_ENV: 'development',
        DATABASE_URL: databaseUrl(),
        ADMIN_DATABASE_URL: databaseUrl(),
        APP_DATABASE_URL: databaseUrl(),
        QRO_SECRETS_KEY_FILE: first.path,
        QRO_SECRETS_PREVIOUS_KEY_FILE: '',
      },
      stdout: 'ignore',
      stderr: 'ignore',
    });
    // Kill it as soon as the first row is committed.
    for (let attempt = 0; attempt < 2000; attempt += 1) {
      const [row] = await sql<{ n: number }[]>`
        select count(*)::int as n from bunq_connections where access_token like 'quro-secret:%'
      `;
      if (row!.n > 0) break;
      await Bun.sleep(2);
    }
    child.kill('SIGKILL');
    await child.exited;
    expectRowsWhole(await readRows());

    const resumed = await quro(['encrypt'], { key: first.path });
    expect(resumed.exitCode).toBe(0);
    expectOpensToSeeded(await readRows(), seeded, keyringOf(first.key));
  });

  test('two runs at the same time encrypt each value exactly once', async () => {
    const seeded = await seedLegacyRows(30);
    const [one, two] = await Promise.all([
      quro(['encrypt'], { key: first.path }),
      quro(['encrypt'], { key: first.path }),
    ]);
    expect(one.exitCode).toBe(0);
    expect(two.exitCode).toBe(0);
    // A value encrypted twice would open to an envelope, not to the seeded text.
    expectOpensToSeeded(await readRows(), seeded, keyringOf(first.key));
  });

  test('mixed states: converts unencrypted values and leaves the others as they are', async () => {
    const plain = await insertConnection('mixed-plain', {
      sessionToken: 'synthetic-session-mixed-plain',
    });
    const done = await insertUser('mixed-done');
    const doneValue = first.key.seal('synthetic-access-done', secretPlace('access_token', done));
    await sql`insert into bunq_connections (user_id, access_token) values (${done}, ${doneValue})`;
    const foreign = await insertUser('mixed-foreign');
    const foreignValue = unrelated.key.seal(
      'synthetic-access-foreign',
      secretPlace('access_token', foreign),
    );
    await sql`insert into bunq_connections (user_id, access_token) values (${foreign}, ${foreignValue})`;
    const damaged = await insertUser('mixed-damaged');
    await sql`insert into bunq_connections (user_id, access_token) values (${damaged}, ${'quro-secret:v1:damaged'})`;
    const half = await insertUser('mixed-half');
    const halfAccess = first.key.seal('synthetic-access-half', secretPlace('access_token', half));
    seededPlaintext.add('synthetic-session-half');
    await sql`insert into bunq_connections (user_id, access_token, session_token)
      values (${half}, ${halfAccess}, ${'synthetic-session-half'})`;

    const run = await quro(['encrypt'], { key: first.path });
    expect(run.exitCode).toBe(0);
    expect(run.out).toContain('Encrypted 3 secret(s) in 2 bank connection(s)');
    expect(run.out).toContain('  encrypted with a key that is not configured: 1');
    expect(run.out).toContain('  damaged, moved or failing their check: 1');

    const byUser = new Map((await readRows()).map((row) => [row.userId, row]));
    const keyring = keyringOf(first.key);
    expect(
      openSecret(byUser.get(plain)!.sessionToken!, secretPlace('session_token', plain), keyring)
        .value,
    ).toBe('synthetic-session-mixed-plain');
    expect(byUser.get(done)!.accessToken).toBe(doneValue);
    expect(byUser.get(foreign)!.accessToken).toBe(foreignValue);
    expect(byUser.get(damaged)!.accessToken).toBe('quro-secret:v1:damaged');
    expect(byUser.get(half)!.accessToken).toBe(halfAccess);
    expect(classifySecret(byUser.get(half)!.sessionToken!, keyring)).toBe('current');
    expectNoPlaintext(await tableText());

    const status = await quro(['status', '--json'], { key: first.path });
    expect(status.exitCode).toBe(1);
    expect(JSON.parse(status.out)).toMatchObject({
      status: 'unreadable',
      unknownKeyIds: [unrelated.key.id],
      reconnectUserIds: [foreign, damaged].sort((a, b) => a - b),
    });
  });
});

describe('wrong, missing and tampered keys', () => {
  test('with another key the stored secrets are reported unreadable and nothing changes', async () => {
    await seedLegacyRows(3);
    expect((await quro(['encrypt'], { key: first.path })).exitCode).toBe(0);
    const snapshot = await tableText();

    const wrong = await quro(['status', '--json'], { key: unrelated.path });
    expect(wrong.exitCode).toBe(1);
    expect(JSON.parse(wrong.out)).toMatchObject({
      status: 'unreadable',
      secrets: { unknownKey: 7, current: 0 },
      unknownKeyIds: [first.key.id],
    });
    const encrypt = await quro(['encrypt'], { key: unrelated.path });
    expect(encrypt.exitCode).toBe(0);
    expect(encrypt.out).toContain('Nothing to encrypt.');
    expect(await tableText()).toBe(snapshot);

    const missing = await quro(['status']);
    expect(missing.exitCode).toBe(1);
    expect(missing.out).toContain('Secrets key: not configured');
    expect(missing.out).toContain(`(key ${first.key.id})`);
    expect((await quro(['status'], { key: first.path })).exitCode).toBe(0);
  });

  test('a changed byte in the database is found by status and never opened', async () => {
    await seedLegacyRows(2);
    expect((await quro(['encrypt'], { key: first.path })).exitCode).toBe(0);
    const [row] = await readRows();
    const parts = row!.accessToken!.split(':');
    parts[5] = `${parts[5]![0] === 'A' ? 'B' : 'A'}${parts[5]!.slice(1)}`;
    await sql`update bunq_connections set access_token = ${parts.join(':')} where id = ${row!.id}`;

    const status = await quro(['status', '--json'], { key: first.path });
    expect(status.exitCode).toBe(1);
    expect(JSON.parse(status.out)).toMatchObject({
      status: 'unreadable',
      secrets: { unreadable: 1 },
      reconnectUserIds: [row!.userId],
    });
  });

  test('an invalid key file stops the command with exit code 2', async () => {
    const short = join(scratch, 'short_key');
    writeFileSync(short, 'abc\n');
    const run = await quro(['status'], { key: short });
    expect(run.exitCode).toBe(2);
    expect(run.err).toContain('QRO_SECRETS_KEY_FILE: the key in');
    expect(run.err).not.toContain('abc\n');
  });
});

describe('quro secrets rotate', () => {
  test('needs the previous key, and a different one', async () => {
    expect((await quro(['rotate'], { key: second.path })).exitCode).toBe(2);
    const same = await quro(['rotate'], { key: first.path, previous: first.path });
    expect(same.exitCode).toBe(2);
    expect(same.err).toContain('holds the same key as QRO_SECRETS_KEY_FILE');
  });

  test('moves every secret to the new key through an interruption, readable all along', async () => {
    const seeded = await seedLegacyRows(4);
    expect((await quro(['encrypt'], { key: first.path })).exitCode).toBe(0);

    // Interrupted after the first row: rows on both keys.
    const rotating = { current: second.key, previous: first.key };
    await expect(
      sealAllRows(database, rotating, 'rotate', {
        afterRow: () => {
          throw new Error('simulated interruption');
        },
      }),
    ).rejects.toThrow('simulated interruption');
    const mixed = await readRows();
    expectRowsWhole(mixed);
    expect(new Set(mixed.map((row) => classifySecret(row.accessToken!, rotating)))).toEqual(
      new Set(['current', 'previous']),
    );
    // With both keys configured every row still opens, as the server needs during a rotation.
    expectOpensToSeeded(mixed, seeded, rotating);
    const pending = await quro(['status', '--json'], { key: second.path, previous: first.path });
    expect(pending.exitCode).toBe(1);
    expect(JSON.parse(pending.out)).toMatchObject({ status: 'rotation_pending' });

    const resumed = await quro(['rotate'], { key: second.path, previous: first.path });
    expect(resumed.exitCode).toBe(0);
    expect(resumed.out).toContain('Status: current.');
    expectNoPlaintext(resumed.all);

    expectOpensToSeeded(await readRows(), seeded, keyringOf(second.key));
    expect((await quro(['status'], { key: second.path })).exitCode).toBe(0);
    // The old key alone no longer opens anything.
    expect(JSON.parse((await quro(['status', '--json'], { key: first.path })).out)).toMatchObject({
      status: 'unreadable',
      unknownKeyIds: [second.key.id],
    });
    expectNoPlaintext(await tableText());
  });
});

describe('maintenance mode', () => {
  test('encrypt refuses while a backup or restore holds maintenance mode', async () => {
    await seedLegacyRows(2);
    const before = await tableText();
    const session = openMaintenanceSession(databaseUrl(), 'secrets-test-backup');
    try {
      await enterMaintenance(session, 0);
      const run = await quro(['encrypt'], { key: first.path });
      expect(run.exitCode).toBe(1);
      expect(run.err).toContain('changes are paused');
      expect(await tableText()).toBe(before);
      await leaveMaintenance(session);
    } finally {
      await session.end({ timeout: 5 });
    }
    expect((await quro(['encrypt'], { key: first.path })).exitCode).toBe(0);
  });
});
