import { afterAll, describe, expect, test } from 'bun:test';
import postgres from 'postgres';
import { getConfig } from '../config';
import { MAINTENANCE_MESSAGE } from '../middleware/maintenance';
import { createIntegrationHelpers } from '../test/integration';
import {
  assertMaintenanceHeld,
  enterMaintenance,
  leaveMaintenance,
  MaintenanceLostError,
  MaintenanceTimeoutError,
  runUnlessMaintenance,
} from './maintenanceMode';

// Maintenance mode against the test database: an exclusive session plays `quro backup`, and the
// application's own gate (or the API) plays the server.

const integration = createIntegrationHelpers('maintenance-mode.integration.quro.test');
const backupSession = () =>
  postgres(getConfig().adminDatabase.url.reveal(), { max: 1, onnotice: () => undefined });

function deferred() {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

afterAll(async () => {
  await integration.cleanup();
});

describe('maintenance mode', () => {
  test('writes run when it is off and are refused while it is on', async () => {
    expect(await runUnlessMaintenance(() => Promise.resolve('done'))).toEqual({
      ran: true,
      value: 'done',
    });
    const session = backupSession();
    try {
      await enterMaintenance(session, 5);
      let ran = false;
      const outcome = await runUnlessMaintenance(() => {
        ran = true;
        return Promise.resolve();
      });
      expect(outcome).toEqual({ ran: false });
      expect(ran).toBe(false);
      await leaveMaintenance(session);
      expect((await runUnlessMaintenance(() => Promise.resolve(1))).ran).toBe(true);
    } finally {
      await session.end();
    }
  });

  test('waits for a running write, refusing new ones while it waits', async () => {
    const session = backupSession();
    const finishWrite = deferred();
    const writeStarted = deferred();
    const running = runUnlessMaintenance(async () => {
      writeStarted.resolve();
      await finishWrite.promise;
      return 'written';
    });
    await writeStarted.promise;
    let entered = false;
    const entering = enterMaintenance(session, 10).then(() => {
      entered = true;
    });
    try {
      await Bun.sleep(200);
      expect(entered).toBe(false);
      // Queued behind the running write, the exclusive request already turns new writes away.
      expect((await runUnlessMaintenance(() => Promise.resolve())).ran).toBe(false);
      finishWrite.resolve();
      expect(await running).toEqual({ ran: true, value: 'written' });
      await entering;
      expect(entered).toBe(true);
    } finally {
      finishWrite.resolve();
      await session.end();
    }
  });

  test('concurrent writes in one process each hold the lock until the last one ends', async () => {
    const session = backupSession();
    const first = deferred();
    const second = deferred();
    const started = [deferred(), deferred()];
    const writes = [first, second].map((finish, index) =>
      runUnlessMaintenance(async () => {
        started[index]!.resolve();
        await finish.promise;
      }),
    );
    await Promise.all(started.map((start) => start.promise));
    let entered = false;
    const entering = enterMaintenance(session, 10).then(() => {
      entered = true;
    });
    try {
      first.resolve();
      await writes[0];
      await Bun.sleep(200);
      expect(entered).toBe(false);
      second.resolve();
      await writes[1];
      await entering;
      expect(entered).toBe(true);
    } finally {
      first.resolve();
      second.resolve();
      await session.end();
    }
  });

  test('gives up after the wait and says how much was still running', async () => {
    const session = backupSession();
    const finishWrite = deferred();
    const writeStarted = deferred();
    const running = runUnlessMaintenance(async () => {
      writeStarted.resolve();
      await finishWrite.promise;
    });
    await writeStarted.promise;
    try {
      const error = await enterMaintenance(session, 1).catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(MaintenanceTimeoutError);
      expect((error as MaintenanceTimeoutError).stillRunning).toBe(1);
      // Nothing is left behind: writes are accepted again.
      expect((await runUnlessMaintenance(() => Promise.resolve())).ran).toBe(true);
    } finally {
      finishWrite.resolve();
      await running;
      await session.end();
    }
  });

  test('with no wait it starts at once or refuses at once, and knows whether it holds', async () => {
    const session = backupSession();
    const finishWrite = deferred();
    const writeStarted = deferred();
    try {
      await expect(assertMaintenanceHeld(session)).rejects.toThrow(MaintenanceLostError);
      await enterMaintenance(session, 0);
      await assertMaintenanceHeld(session);
      await leaveMaintenance(session);

      const running = runUnlessMaintenance(async () => {
        writeStarted.resolve();
        await finishWrite.promise;
      });
      await writeStarted.promise;
      const started = Date.now();
      await expect(enterMaintenance(session, 0)).rejects.toThrow(MaintenanceTimeoutError);
      expect(Date.now() - started).toBeLessThan(1000);
      finishWrite.resolve();
      await running;
    } finally {
      finishWrite.resolve();
      await session.end();
    }
  });

  test('ends when the holding session ends, even without leaving it', async () => {
    const session = backupSession();
    await enterMaintenance(session, 5);
    expect((await runUnlessMaintenance(() => Promise.resolve())).ran).toBe(false);
    await session.end();
    expect((await runUnlessMaintenance(() => Promise.resolve())).ran).toBe(true);
  });

  test('a failing write releases its share of the lock', async () => {
    await expect(runUnlessMaintenance(() => Promise.reject(new Error('boom')))).rejects.toThrow(
      'boom',
    );
    const session = backupSession();
    try {
      await enterMaintenance(session, 2);
      await leaveMaintenance(session);
    } finally {
      await session.end();
    }
  });
});

describe('the API in maintenance mode', () => {
  test('answers writes with 503 and Retry-After, and keeps serving reads', async () => {
    const user = await integration.signUp('maintenance');
    const session = backupSession();
    try {
      await enterMaintenance(session, 5);
      const write = await integration.request('/api/goals', {
        method: 'POST',
        cookie: user.cookie,
        json: { name: 'Synthetic goal', targetAmount: 1000, currentAmount: 0, currency: 'EUR' },
      });
      expect(write.status).toBe(503);
      expect(write.headers.get('retry-after')).toBe('60');
      expect(await write.json()).toEqual({ error: MAINTENANCE_MESSAGE, code: 'maintenance' });
      const read = await integration.request('/api/goals', { cookie: user.cookie });
      expect(read.status).toBe(200);
      const health = await integration.request('/api/health');
      expect(health.status).toBe(200);
    } finally {
      await session.end();
    }
  });

  test('a request in flight finishes before maintenance mode starts', async () => {
    const user = await integration.signUp('maintenance-in-flight');
    const session = backupSession();
    // A payslip whose body arrives slowly keeps a write request open.
    const body = new TransformStream<Uint8Array, Uint8Array>();
    const writer = body.writable.getWriter();
    const encoder = new TextEncoder();
    const create = integration.request('/api/salary/payslips', {
      method: 'POST',
      cookie: user.cookie,
      headers: { 'Content-Type': 'application/json' },
      body: body.readable,
    });
    await writer.write(encoder.encode('{"employmentId":null,"month":"Synthetic",'));
    await Bun.sleep(100);
    let entered = false;
    const entering = enterMaintenance(session, 10).then(() => {
      entered = true;
    });
    try {
      await Bun.sleep(200);
      expect(entered).toBe(false);
      // Refused from the moment maintenance mode is requested, signed in or not.
      const refused = await integration.request('/api/salary/payslips', {
        method: 'POST',
        cookie: user.cookie,
        json: { month: 'Refused' },
      });
      expect(refused.status).toBe(503);
      const signIn = await integration.request('/api/auth/signin', {
        method: 'POST',
        json: { email: 'nobody@example.test', password: 'wrong-password-123' },
      });
      expect(signIn.status).toBe(503);
      await writer.write(
        encoder.encode(
          '"date":"2026-09-25","gross":4000,"tax":900,"pension":200,"net":2900,"bonus":null,"currency":"EUR"}',
        ),
      );
      await writer.close();
      expect((await create).status).toBe(201);
      await entering;
      expect(entered).toBe(true);
    } finally {
      await session.end();
    }
  });

  test('a slow unauthenticated request does not hold maintenance mode off', async () => {
    const session = backupSession();
    const body = new TransformStream<Uint8Array, Uint8Array>();
    const writer = body.writable.getWriter();
    const encoder = new TextEncoder();
    const signIn = integration.request('/api/auth/signin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body.readable,
    });
    await writer.write(encoder.encode('{"email":"nobody@example.test",'));
    await Bun.sleep(100);
    try {
      await enterMaintenance(session, 2);
      await writer.write(encoder.encode('"password":"wrong-password-123"}'));
      await writer.close();
      expect((await signIn).status).toBe(401);
    } finally {
      await session.end();
    }
  });
});
