import { describe, expect, setDefaultTimeout, test } from 'bun:test';
import { resolve } from 'node:path';
import { shutDown, type ShutdownParts } from './gracefulShutdown';

setDefaultTimeout(30_000);

const BACKEND_DIR = resolve(import.meta.dir, '../..');

function parts(events: string[], overrides: Partial<ShutdownParts> = {}): ShutdownParts {
  return {
    stopServer: async () => {
      events.push('server stopping');
      await Bun.sleep(20);
      events.push('server stopped');
    },
    pendingRequests: () => 2,
    stopJobs: async () => {
      events.push('jobs stopping');
      await Bun.sleep(40);
      events.push('jobs stopped');
    },
    closeDatabase: () => {
      events.push('database closed');
      return Promise.resolve();
    },
    log: (line) => events.push(line),
    exit: () => undefined,
    ...overrides,
  };
}

describe('graceful shutdown', () => {
  test('stops taking requests and jobs, waits for both, then closes the database', async () => {
    const events: string[] = [];
    await shutDown(parts(events), 'SIGTERM');
    expect(events).toEqual([
      '[server] SIGTERM received: refusing new connections, finishing 2 open request(s) and running jobs',
      'server stopping',
      'jobs stopping',
      'server stopped',
      'jobs stopped',
      'database closed',
      '[server] Stopped',
    ]);
  });
});

async function freePort(): Promise<number> {
  const probe = Bun.serve({ port: 0, fetch: () => new Response('') });
  const { port } = probe;
  await probe.stop(true);
  return port!;
}

describe('the server process on SIGTERM', () => {
  test('answers the request in flight, refuses new connections and exits with 0', async () => {
    const port = await freePort();
    const child = Bun.spawn([process.execPath, 'src/index.ts'], {
      cwd: BACKEND_DIR,
      env: {
        ...process.env,
        NODE_ENV: 'development',
        PORT: String(port),
        HOST: '127.0.0.1',
        QRO_DISABLE_SCHEDULERS: 'true',
        HTTP_PROXY: 'http://127.0.0.1:9',
        HTTPS_PROXY: 'http://127.0.0.1:9',
        NO_PROXY: '127.0.0.1,localhost',
      },
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const url = `http://127.0.0.1:${port}`;
    try {
      for (let attempt = 0; ; attempt += 1) {
        const ready = await fetch(`${url}/api/health`).then(
          (response) => response.ok,
          () => false,
        );
        if (ready) break;
        if (attempt > 200) throw new Error('The backend did not start');
        await Bun.sleep(100);
      }
      // A sign-in whose body arrives slowly is a write request in flight.
      const body = new TransformStream<Uint8Array, Uint8Array>();
      const writer = body.writable.getWriter();
      const encoder = new TextEncoder();
      const inFlight = fetch(`${url}/api/auth/signin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Real-IP': '203.0.113.9' },
        body: body.readable,
        // @ts-expect-error Bun streams request bodies; the option is required by the Fetch spec.
        duplex: 'half',
      });
      await writer.write(encoder.encode('{"email":"nobody@example.test",'));
      await Bun.sleep(300);

      child.kill('SIGTERM');
      await Bun.sleep(500);
      expect(child.exitCode).toBeNull();
      const refused = await fetch(`${url}/api/health`).then(
        () => 'answered',
        () => 'refused',
      );
      expect(refused).toBe('refused');

      await writer.write(encoder.encode('"password":"wrong-password-123"}'));
      await writer.close();
      expect((await inFlight).status).toBe(401);
      expect(await child.exited).toBe(0);
      expect(await new Response(child.stdout).text()).toContain('[server] Stopped');
    } finally {
      child.kill('SIGKILL');
    }
  });
});
