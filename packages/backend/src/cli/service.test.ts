import { describe, expect, test } from 'bun:test';
import { EXIT_FAILURE, EXIT_OK, EXIT_USAGE } from './io';
import { runQuro } from './quro';
import { runHealthCommand, runVersionCommand } from './service';

function capture() {
  const lines: string[] = [];
  const io = { out: (line: string) => lines.push(line), err: (line: string) => lines.push(line) };
  return { io, text: () => lines.join('\n') };
}

const respond = (status: number, body: unknown) =>
  (() => Promise.resolve(Response.json(body, { status }))) as unknown as typeof fetch;

describe('quro health', () => {
  test('exits 0 when the server reports ready', async () => {
    const { io, text } = capture();
    let requested = '';
    const fetcher = ((url: string) => {
      requested = url;
      return Promise.resolve(Response.json({ status: 'ready' }));
    }) as unknown as typeof fetch;
    expect(await runHealthCommand([], io, fetcher)).toBe(EXIT_OK);
    expect(requested).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/api\/readiness$/);
    expect(text()).toBe('ready');
  });

  test('exits 1 and names the failing checks when the server is not ready', async () => {
    const { io, text } = capture();
    const body = {
      status: 'not_ready',
      checks: {
        database: { ready: true, message: 'Database connection succeeded.' },
        schema: { ready: false, message: 'The database has no schema yet. Run `quro migrate`.' },
      },
    };
    expect(await runHealthCommand([], io, respond(503, body))).toBe(EXIT_FAILURE);
    expect(text()).toContain('not ready (HTTP 503): schema: The database has no schema yet.');
  });

  test('exits 1 when nothing answers', async () => {
    const { io, text } = capture();
    const offline = (() => Promise.reject(new Error('refused'))) as unknown as typeof fetch;
    expect(await runHealthCommand([], io, offline)).toBe(EXIT_FAILURE);
    expect(text()).toContain('no answer');
  });
});

describe('quro version', () => {
  test('prints the version, the newest bundled migration and the revision', () => {
    const { io, text } = capture();
    expect(runVersionCommand(['--json'], io)).toBe(EXIT_OK);
    const info = JSON.parse(text());
    // An interface for automation (docs/upgrade.md): these fields stay.
    expect(Object.keys(info).sort()).toEqual(['migrations', 'revision', 'runtime', 'version']);
    expect(Object.keys(info.migrations).sort()).toEqual(['count', 'latest']);
    expect(Object.keys(info.runtime).sort()).toEqual(['arch', 'bun', 'platform']);
    expect(info.version).toMatch(/^v?\d+\.\d+\.\d+/);
    expect(info.migrations.latest).toMatch(/^\d{4}_\w+$/);
    expect(info.migrations.count).toBeGreaterThan(0);
    expect(typeof info.revision).toBe('string');
  });
});

describe('quro dispatcher', () => {
  test('every command answers --help with exit code 0 and needs no settings', async () => {
    for (const command of ['serve', 'worker', 'init', 'migrate', 'doctor', 'health', 'version']) {
      const { io, text } = capture();
      expect(await runQuro([command, '--help'], io)).toBe(EXIT_OK);
      expect(text()).toContain(`quro ${command}`);
    }
  });

  test('usage mistakes exit with code 2', async () => {
    const { io } = capture();
    expect(await runQuro(['version', '--yaml'], io)).toBe(EXIT_USAGE);
    expect(await runQuro(['migrate', '--force'], io)).toBe(EXIT_USAGE);
    expect(await runQuro(['worker', 'unknown'], io)).toBe(EXIT_USAGE);
    expect(await runQuro(['no-such-command'], io)).toBe(EXIT_USAGE);
  });
});
