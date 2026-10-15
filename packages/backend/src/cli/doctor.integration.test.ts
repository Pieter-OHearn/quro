import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { randomBytes } from 'node:crypto';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import postgres from 'postgres';
import { secretPlace } from '../lib/integrationSecrets';
import { SecretsKey } from '../lib/secretEnvelope';
import { migrateDatabase } from '../db/migrateDatabase';
import { applyTestSettings } from '../test/config';
import type { DoctorReport } from './doctor';
import { EXIT_FAILURE, EXIT_OK, EXIT_REFUSED, EXIT_UNAVAILABLE, EXIT_USAGE } from './io';
import { runQuro } from './quro';

// `quro doctor` against databases and roles created for this suite, with synthetic passwords.

const serverUrl = new URL(process.env.DATABASE_URL!);
const suffix = randomBytes(4).toString('hex');
const server = postgres(serverUrl.toString(), { max: 1, onnotice: () => undefined });
const owner = { name: `quro_doctor_owner_${suffix}`, password: randomBytes(16).toString('hex') };
const app = { name: `quro_doctor_app_${suffix}`, password: randomBytes(16).toString('hex') };
const migrated = `quro_doctor_ready_${suffix}`;
const empty = `quro_doctor_empty_${suffix}`;
const scratch = mkdtempSync(join(tmpdir(), 'quro-doctor-'));
const documents = join(scratch, 'documents');
const fakePgDump = join(scratch, 'pg_dump');

function urlFor(database: string, role: { name: string; password: string }) {
  const url = new URL(serverUrl.toString());
  url.pathname = `/${database}`;
  url.username = role.name;
  url.password = role.password;
  return url.toString();
}

function settingsFor(database: string, extra: Record<string, string | undefined> = {}) {
  return {
    DATABASE_URL: undefined,
    ADMIN_DATABASE_URL: urlFor(database, owner),
    APP_DATABASE_URL: urlFor(database, app),
    QRO_DOCUMENT_STORAGE: 'filesystem',
    QRO_DOCUMENTS_DIR: documents,
    QRO_PG_DUMP_BIN: fakePgDump,
    QRO_SECRETS_KEY_FILE: undefined,
    QRO_SECRETS_PREVIOUS_KEY_FILE: undefined,
    ...extra,
  };
}

async function doctor(settings: Record<string, string | undefined>, ...args: string[]) {
  const restore = applyTestSettings(settings);
  const lines: string[] = [];
  try {
    const exitCode = await runQuro(['doctor', ...args], {
      out: (line) => lines.push(line),
      err: (line) => lines.push(line),
    });
    return { exitCode, out: lines.join('\n') };
  } finally {
    restore();
  }
}

async function report(settings: Record<string, string | undefined>) {
  const run = await doctor(settings, '--json');
  return { ...run, report: JSON.parse(run.out) as DoctorReport };
}

const statusOf = (doctorReport: DoctorReport, id: string) =>
  doctorReport.checks.find((check) => check.id === id)?.status;

beforeAll(async () => {
  writeFileSync(fakePgDump, '#!/bin/sh\necho "pg_dump (PostgreSQL) 99.0"\n');
  chmodSync(fakePgDump, 0o755);
  await Bun.write(join(documents, '.keep'), '');
  await server.unsafe(`create role ${owner.name} login createrole password '${owner.password}'`);
  for (const database of [migrated, empty]) {
    await server.unsafe(`create database ${database} owner ${owner.name}`);
  }
  const outcome = await migrateDatabase({
    adminUrl: urlFor(migrated, owner),
    target: { host: 'test', port: 5432, database: migrated, user: owner.name },
    runtime: { user: app.name, url: urlFor(migrated, app), password: app.password },
    dryRun: false,
    print: () => undefined,
  });
  expect(outcome).toEqual({ kind: 'ok' });
});

afterAll(async () => {
  for (const database of [migrated, empty]) {
    await server.unsafe(`drop database if exists ${database} with (force)`);
  }
  await server.unsafe(`drop role if exists ${app.name}`);
  await server.unsafe(`drop role if exists ${owner.name}`);
  await server.end({ timeout: 5 });
  rmSync(scratch, { recursive: true, force: true });
});

describe('quro doctor', () => {
  test('passes on a migrated install and prints no secret', async () => {
    const run = await report(settingsFor(migrated));
    expect(run.exitCode).toBe(EXIT_OK);
    expect(run.report.status).toBe('ok');
    for (const id of [
      'runtime',
      'settings',
      'database.admin',
      'database.version',
      'database.owner',
      'database.schema',
      'database.runtime',
      'backup.tools',
      'documents',
      'secrets',
    ]) {
      expect(statusOf(run.report, id)).toBe('ok');
    }
    expect(run.report.build.migrations.latest).toMatch(/^\d{4}_/);
    expect(run.out).not.toContain(owner.password);
    expect(run.out).not.toContain(app.password);
    expect(run.out).not.toContain('postgres://');
  });

  test('ignores a setting of an earlier release without printing its value', async () => {
    const oldValue = `old-${randomBytes(8).toString('hex')}`;
    const run = await report(settingsFor(migrated, { POSTGRES_PASSWORD: oldValue }));
    expect(run.exitCode).toBe(EXIT_OK);
    expect(run.report.checks.some((item) => item.id === 'settings.POSTGRES_PASSWORD')).toBe(false);
    expect(run.out).not.toContain(oldValue);
  });

  test('reports a schema behind the image (exit 1) and changes nothing', async () => {
    const run = await doctor(settingsFor(empty));
    expect(run.exitCode).toBe(EXIT_FAILURE);
    expect(run.out).toContain(
      'FAIL  database.schema: The database has no schema yet. Run `quro migrate`.',
    );
    const sql = postgres(urlFor(empty, owner), { max: 1 });
    try {
      const [row] = await sql<{ exists: boolean }[]>`
        select to_regnamespace('drizzle') is not null as "exists"
      `;
      expect(row?.exists).toBe(false);
    } finally {
      await sql.end({ timeout: 5 });
    }
  });

  test('reports a schema newer than the image as refused (exit 3)', async () => {
    const sql = postgres(urlFor(migrated, owner), { max: 1 });
    try {
      await sql`insert into drizzle.__drizzle_migrations (hash, created_at) values ('newer-image', 9999999999999)`;
      const run = await report(settingsFor(migrated));
      expect(run.exitCode).toBe(EXIT_REFUSED);
      expect(statusOf(run.report, 'database.schema')).toBe('fail');
    } finally {
      await sql`delete from drizzle.__drizzle_migrations where hash = 'newer-image'`;
      await sql.end({ timeout: 5 });
    }
  });

  test('reports a backup tool older than the server', async () => {
    const old = join(scratch, 'pg_dump_old');
    writeFileSync(old, '#!/bin/sh\necho "pg_dump (PostgreSQL) 15.0"\n');
    chmodSync(old, 0o755);
    const run = await report(settingsFor(migrated, { QRO_PG_DUMP_BIN: old }));
    expect(run.exitCode).toBe(EXIT_FAILURE);
    expect(statusOf(run.report, 'backup.tools')).toBe('fail');
  });

  test('exit codes: invalid settings 2, unreachable database 4, missing documents directory 1', async () => {
    const s3WithoutDriver = await doctor(
      settingsFor(migrated, {
        QRO_DOCUMENT_STORAGE: undefined,
        S3_ENDPOINT: 'http://s3.test.invalid',
      }),
    );
    expect(s3WithoutDriver.exitCode).toBe(EXIT_USAGE);
    expect(s3WithoutDriver.out).toContain('QRO_DOCUMENT_STORAGE');

    const offline = new URL(urlFor(migrated, owner));
    offline.port = '1';
    const unreachable = await doctor(
      settingsFor(migrated, { ADMIN_DATABASE_URL: offline.toString() }),
    );
    expect(unreachable.exitCode).toBe(EXIT_UNAVAILABLE);

    const noDocuments = await report(
      settingsFor(migrated, { QRO_DOCUMENTS_DIR: join(scratch, 'missing') }),
    );
    expect(noDocuments.exitCode).toBe(EXIT_FAILURE);
    expect(statusOf(noDocuments.report, 'documents')).toBe('fail');
  });

  test('reports stored bank-link secrets by state and key id, never their values', async () => {
    const keyHex = randomBytes(32).toString('hex');
    const keyFile = join(scratch, 'secrets_key');
    const otherKeyFile = join(scratch, 'other_secrets_key');
    writeFileSync(keyFile, `${keyHex}\n`);
    writeFileSync(otherKeyFile, `${randomBytes(32).toString('hex')}\n`);
    const key = SecretsKey.parse(keyHex);
    const marker = `synthetic-doctor-access-${suffix}`;
    const sql = postgres(urlFor(migrated, owner), { max: 1, onnotice: () => undefined });
    try {
      const [user] = await sql<{ id: number }[]>`
        insert into users (first_name, last_name, email, password_hash)
        values ('Synthetic', 'Doctor', ${`doctor-${suffix}@doctor.quro.test`}, 'synthetic-hash')
        returning id`;
      await sql`insert into bunq_connections (user_id, access_token) values (${user!.id}, ${marker})`;
      const secretsCheck = (doctorReport: DoctorReport) =>
        doctorReport.checks.find((check) => check.id === 'secrets')!;

      const withoutKey = await report(settingsFor(migrated));
      expect(withoutKey.exitCode).toBe(EXIT_OK);
      expect(secretsCheck(withoutKey.report)).toMatchObject({
        status: 'warn',
        message:
          '1 of 1 bank-link secret(s) are stored unencrypted. Set QRO_SECRETS_KEY_FILE, then run `quro secrets encrypt`.',
      });
      const withKey = await report(settingsFor(migrated, { QRO_SECRETS_KEY_FILE: keyFile }));
      expect(secretsCheck(withKey.report).message).toContain('Run `quro secrets encrypt`.');

      const sealed = key.seal(marker, secretPlace('access_token', user!.id));
      await sql`update bunq_connections set access_token = ${sealed} where user_id = ${user!.id}`;
      const encrypted = await report(settingsFor(migrated, { QRO_SECRETS_KEY_FILE: keyFile }));
      expect(encrypted.exitCode).toBe(EXIT_OK);
      expect(secretsCheck(encrypted.report)).toMatchObject({
        status: 'ok',
        message: `1 bank-link secret(s), all encrypted with key ${key.id}.`,
      });

      // A container without the key cannot check them: a warning, not a failure.
      const noKeyHere = await report(settingsFor(migrated));
      expect(noKeyHere.exitCode).toBe(EXIT_OK);
      expect(secretsCheck(noKeyHere.report)).toMatchObject({ status: 'warn' });
      expect(secretsCheck(noKeyHere.report).message).toContain(`encrypted with key ${key.id}`);

      const wrongKey = await report(settingsFor(migrated, { QRO_SECRETS_KEY_FILE: otherKeyFile }));
      expect(wrongKey.exitCode).toBe(EXIT_FAILURE);
      expect(secretsCheck(wrongKey.report).status).toBe('fail');
      expect(secretsCheck(wrongKey.report).message).toContain(`(users ${user!.id})`);

      const invalidKey = await doctor(settingsFor(migrated, { QRO_SECRETS_KEY_FILE: fakePgDump }));
      expect(invalidKey.exitCode).toBe(EXIT_USAGE);
      expect(invalidKey.out).toContain('QRO_SECRETS_KEY_FILE: the key in');

      for (const run of [withoutKey, withKey, encrypted, noKeyHere, wrongKey, invalidKey]) {
        expect(run.out).not.toContain(marker);
        expect(run.out).not.toContain(keyHex);
      }
    } finally {
      await sql`delete from bunq_connections`;
      await sql`delete from users where email like '%@doctor.quro.test'`;
      await sql.end({ timeout: 5 });
    }
  });

  test('a wrong runtime password is a settings problem pointing at quro migrate', async () => {
    const wrong = new URL(urlFor(migrated, app));
    wrong.password = 'not-the-password';
    const run = await report(settingsFor(migrated, { APP_DATABASE_URL: wrong.toString() }));
    expect(run.exitCode).toBe(EXIT_FAILURE);
    const check = run.report.checks.find((item) => item.id === 'database.runtime');
    expect(check?.message).toContain('quro migrate');
    expect(run.out).not.toContain('not-the-password');
  });
});
