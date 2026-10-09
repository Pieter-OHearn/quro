import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { chmod, mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createDatabaseBackup,
  describeToolVersionProblem,
  parsePgToolMajor,
  restoreDatabaseBackup,
  serverMajorFromVersionNum,
} from './pgTools';
import { applyTestSettings } from '../test/config';

describe('PostgreSQL tool versions', () => {
  test('reads the major version from tool output', () => {
    expect(parsePgToolMajor('pg_dump (PostgreSQL) 18.6 (Debian 18.6-1.pgdg13+2)')).toBe(18);
    expect(parsePgToolMajor('pg_restore (PostgreSQL) 17.11 (Debian 17.11-0+deb13u1)\n')).toBe(17);
    expect(parsePgToolMajor('psql (PostgreSQL) 16.11')).toBe(16);
    expect(parsePgToolMajor('pg_dump (PostgreSQL) 19devel')).toBe(19);
  });

  test('does not guess when the output is not a version line', () => {
    expect(parsePgToolMajor('')).toBeNull();
    expect(parsePgToolMajor('command not found')).toBeNull();
    expect(parsePgToolMajor('version 18')).toBeNull();
  });

  test('derives the server major from server_version_num', () => {
    expect(serverMajorFromVersionNum(160011)).toBe(16);
    expect(serverMajorFromVersionNum(170002)).toBe(17);
    expect(serverMajorFromVersionNum(180006)).toBe(18);
  });

  test('refuses a client older than the server and names the fix', () => {
    const message = describeToolVersionProblem('pg_dump', 17, 18);
    expect(message).toContain('pg_dump is PostgreSQL 17 but the database server is PostgreSQL 18');
    expect(message).toContain('QRO_PG_DUMP_BIN');
    expect(describeToolVersionProblem('pg_restore', 16, 17)).toContain('QRO_PG_RESTORE_BIN');
    expect(describeToolVersionProblem('psql', 16, 17)).toContain('QRO_PSQL_BIN');
  });

  test('accepts a client of the same or a newer major', () => {
    expect(describeToolVersionProblem('pg_dump', 18, 18)).toBeNull();
    expect(describeToolVersionProblem('pg_dump', 18, 16)).toBeNull();
    expect(describeToolVersionProblem('pg_restore', 17, 16)).toBeNull();
  });
});

// The guard reads the real server version, so these need the migrated throwaway database that
// `bun run test` requires. The tool binaries are stand-ins that report a version and record
// whether they were asked to do any work.
const connectionString = process.env.ADMIN_DATABASE_URL ?? process.env.DATABASE_URL ?? '';

const OVERRIDES = ['QRO_PG_DUMP_BIN', 'QRO_PG_RESTORE_BIN', 'QRO_PSQL_BIN'] as const;

describe('backup and restore client guard', () => {
  let workDir = '';
  let savedEnv: Record<string, string | undefined> = {};

  beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), 'quro-pgtools-'));
    savedEnv = Object.fromEntries(OVERRIDES.map((name) => [name, process.env[name]]));
  });

  afterEach(async () => {
    applyTestSettings(savedEnv);
    await rm(workDir, { recursive: true, force: true });
  });

  /** A tool that prints `versionLine` for --version and otherwise creates `<workDir>/ran`. */
  async function fakeTool(name: string, versionLine: string) {
    const path = join(workDir, name);
    await writeFile(
      path,
      `#!/bin/sh\nif [ "$1" = "--version" ]; then echo '${versionLine}'; exit 0; fi\n: > '${join(workDir, 'ran')}'\n`,
    );
    await chmod(path, 0o755);
    return path;
  }

  function exists(path: string) {
    return stat(path).then(
      () => true,
      () => false,
    );
  }

  test('a dump with an older pg_dump is refused before anything is written', async () => {
    applyTestSettings({ QRO_PG_DUMP_BIN: await fakeTool('pg_dump', 'pg_dump (PostgreSQL) 12.0') });
    const outputPath = join(workDir, 'backups', 'quro.dump');

    await expect(createDatabaseBackup({ connectionString, outputPath })).rejects.toThrow(
      /pg_dump is PostgreSQL 12 but the database server is PostgreSQL \d+/,
    );
    expect(await exists(join(workDir, 'backups'))).toBe(false);
    expect(await exists(join(workDir, 'ran'))).toBe(false);
  });

  test('a restore with an older pg_restore is refused without running it', async () => {
    applyTestSettings({
      QRO_PG_RESTORE_BIN: await fakeTool('pg_restore', 'pg_restore (PostgreSQL) 12.0'),
    });

    await expect(
      restoreDatabaseBackup({ connectionString, inputPath: join(workDir, 'quro.dump') }),
    ).rejects.toThrow(/pg_restore is PostgreSQL 12 but the database server is PostgreSQL \d+/);
    expect(await exists(join(workDir, 'ran'))).toBe(false);
  });

  test('a plain SQL restore with an older psql is refused without running it', async () => {
    applyTestSettings({ QRO_PSQL_BIN: await fakeTool('psql', 'psql (PostgreSQL) 12.0') });

    await expect(
      restoreDatabaseBackup({ connectionString, inputPath: join(workDir, 'quro.sql') }),
    ).rejects.toThrow(/psql is PostgreSQL 12 but the database server is PostgreSQL \d+/);
    expect(await exists(join(workDir, 'ran'))).toBe(false);
  });

  test('a tool whose version cannot be read is refused', async () => {
    applyTestSettings({ QRO_PG_DUMP_BIN: await fakeTool('pg_dump', 'not a version') });

    await expect(
      createDatabaseBackup({ connectionString, outputPath: join(workDir, 'quro.dump') }),
    ).rejects.toThrow(/Could not read the version of pg_dump/);
    expect(await exists(join(workDir, 'ran'))).toBe(false);
  });

  test('a newer client is allowed through to the tool', async () => {
    applyTestSettings({ QRO_PG_DUMP_BIN: await fakeTool('pg_dump', 'pg_dump (PostgreSQL) 99.0') });

    await createDatabaseBackup({ connectionString, outputPath: join(workDir, 'out', 'quro.dump') });
    expect(await exists(join(workDir, 'ran'))).toBe(true);
  });
});
