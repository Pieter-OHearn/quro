import { expect, test } from 'bun:test';
import { runCoordinatedJob, type JobLease } from './coordinatedJob';
import { abortableRead, upstreamSignal } from './workDeadline';

function testLease() {
  const state = { locked: false, releases: 0, successes: 0, lastRun: null as Date | null };
  const lease: JobLease = {
    acquire: () => {
      if (state.locked) return Promise.resolve(false);
      state.locked = true;
      return Promise.resolve(true);
    },
    lastSuccess: () => Promise.resolve(state.lastRun),
    recordSuccess: () => {
      state.successes += 1;
      state.lastRun = new Date();
      return Promise.resolve();
    },
    unlock: () => {
      state.locked = false;
      return Promise.resolve();
    },
    release: () => {
      state.releases += 1;
    },
  };
  return { state, reserve: () => Promise.resolve(lease) };
}

test('hung upstream times out, drains before unlocking, and retries on a later tick', async () => {
  const { state, reserve } = testLease();
  let finish: () => void = () => {};
  let writes = 0;
  let drained = false;
  const first = runCoordinatedJob(
    reserve,
    60_000,
    async () => {
      try {
        await abortableRead(
          upstreamSignal(),
          () =>
            new Promise<void>((resolve) => {
              finish = resolve;
            }),
        );
        writes += 1;
      } finally {
        await Bun.sleep(20);
        expect(state.locked).toBe(true);
        drained = true;
      }
    },
    10,
  );
  await expect(first).rejects.toThrow('deadline exceeded');
  expect(drained).toBe(true);
  expect(state.locked).toBe(false);
  expect(state.releases).toBe(1);
  expect(state.successes).toBe(0);
  finish();
  await Bun.sleep(10);
  expect(writes).toBe(0);
  await runCoordinatedJob(reserve, 60_000, () => {
    writes += 1;
    return Promise.resolve();
  });
  expect(writes).toBe(1);
  expect(state.successes).toBe(1);
  expect(state.releases).toBe(2);
});

test('expired callback cannot record success even when it swallows cancellation', async () => {
  const { state, reserve } = testLease();
  await expect(
    runCoordinatedJob(
      reserve,
      60_000,
      async () => {
        try {
          await abortableRead(upstreamSignal(), () => new Promise<void>(() => {}));
        } catch {
          /* swallowed */
        }
      },
      10,
    ),
  ).rejects.toThrow('deadline exceeded');
  expect(state.successes).toBe(0);
  expect(state.releases).toBe(1);
});

test('bunq scheduler aborts a hanging upstream and can retry', async () => {
  const originalFetch = globalThis.fetch;
  const { state, reserve } = testLease();
  const { fetchMonetaryAccounts } = await import('./bunqClient');
  let aborted = false;
  let writes = 0;
  globalThis.fetch = ((_url: unknown, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener(
        'abort',
        () => {
          aborted = true;
          reject(init.signal?.reason);
        },
        { once: true },
      );
    })) as unknown as typeof fetch;
  try {
    await expect(
      runCoordinatedJob(
        reserve,
        60_000,
        async () => {
          await fetchMonetaryAccounts('synthetic', '42');
          writes += 1;
        },
        10,
      ),
    ).rejects.toThrow('deadline exceeded');
    expect(aborted).toBe(true);
    expect(writes).toBe(0);
    expect(state.locked).toBe(false);
    expect(state.releases).toBe(1);
    globalThis.fetch = (() =>
      Promise.resolve(Response.json({ Response: [] }))) as unknown as typeof fetch;
    await runCoordinatedJob(reserve, 60_000, async () => {
      await fetchMonetaryAccounts('synthetic', '42');
      writes += 1;
    });
    expect(writes).toBe(1);
    expect(state.successes).toBe(1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
