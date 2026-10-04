import { afterEach, expect, mock, spyOn, test } from 'bun:test';
import YahooFinance from 'yahoo-finance2';
import { YahooFinanceMarketDataClient } from './yahooFinanceClient';
import { runCoordinatedJob, type JobLease } from './coordinatedJob';

afterEach(() => mock.restore());

function hangingClient() {
  let signal: AbortSignal | undefined;
  let finish: (value: unknown) => void = () => {};
  const read = (
    _query: unknown,
    _options: unknown,
    moduleOptions: { fetchOptions: RequestInit },
  ) => {
    signal = moduleOptions.fetchOptions.signal ?? undefined;
    return new Promise((resolve) => {
      finish = resolve;
    });
  };
  const client = new YahooFinanceMarketDataClient(
    () =>
      ({
        quoteSummary: read,
        quote: read,
      }) as unknown as InstanceType<typeof YahooFinance>,
  );
  return { client, finish: (value: unknown) => finish(value), signal: () => signal };
}

test('Yahoo lookup request times out and passes cancellation to the provider', async () => {
  const timeout = AbortSignal.timeout.bind(AbortSignal);
  spyOn(AbortSignal, 'timeout').mockImplementation(() => timeout(10));
  const { client, signal, finish } = hangingClient();
  let writes = 0;
  const lookup = client.lookupSymbol('SYNTHETIC').then(() => {
    writes += 1;
  });
  await expect(lookup).rejects.toThrow();
  expect(signal()?.aborted).toBe(true);
  finish({ price: { symbol: 'SYNTHETIC' } });
  await Bun.sleep(10);
  expect(writes).toBe(0);
});

test('Yahoo quotes propagate request timeouts', async () => {
  const timeout = AbortSignal.timeout.bind(AbortSignal);
  spyOn(AbortSignal, 'timeout').mockImplementation(() => timeout(10));
  const { client, signal } = hangingClient();
  await expect(client.getLatestEod(['SYNTHETIC'])).rejects.toThrow();
  expect(signal()?.aborted).toBe(true);
});

test('Yahoo job timeout releases the lease, rejects late writes, and allows another tick', async () => {
  let locked = false;
  let releases = 0;
  let successes = 0;
  let writes = 0;
  const lease: JobLease = {
    acquire: () => {
      locked = true;
      return Promise.resolve(true);
    },
    lastSuccess: () => Promise.resolve(null),
    recordSuccess: () => {
      successes += 1;
      return Promise.resolve();
    },
    unlock: () => {
      locked = false;
      return Promise.resolve();
    },
    release: () => {
      releases += 1;
    },
  };
  const { client, signal, finish } = hangingClient();
  await expect(
    runCoordinatedJob(
      () => Promise.resolve(lease),
      60_000,
      async () => {
        await client.getLatestEod(['SYNTHETIC']);
        writes += 1;
      },
      10,
    ),
  ).rejects.toThrow('deadline exceeded');
  expect(signal()?.aborted).toBe(true);
  expect(locked).toBe(false);
  expect(releases).toBe(1);
  expect(successes).toBe(0);
  finish([{ symbol: 'SYNTHETIC', regularMarketPrice: 42 }]);
  await Bun.sleep(10);
  expect(writes).toBe(0);
  await runCoordinatedJob(
    () => Promise.resolve(lease),
    60_000,
    () => {
      writes += 1;
      return Promise.resolve();
    },
  );
  expect(successes).toBe(1);
  expect(releases).toBe(2);
});

test('Yahoo library forwards the signal to its initial cookie/crumb fetch', async () => {
  const originalFetch = globalThis.fetch;
  const timeout = AbortSignal.timeout.bind(AbortSignal);
  spyOn(AbortSignal, 'timeout').mockImplementation(() => timeout(30));
  let aborted = false;
  globalThis.fetch = mock(
    (_url: unknown, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener(
          'abort',
          () => {
            aborted = true;
            reject(init.signal?.reason);
          },
          { once: true },
        );
      }),
  ) as unknown as typeof fetch;
  try {
    await expect(new YahooFinanceMarketDataClient().lookupSymbol('SYNTHETIC')).rejects.toThrow();
    expect(aborted).toBe(true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Yahoo reuses a healthy client and replaces it after cancellation', async () => {
  const timeout = AbortSignal.timeout.bind(AbortSignal);
  spyOn(AbortSignal, 'timeout').mockImplementation(() => timeout(10));
  let calls = 0;
  let hang = false;
  const factory = mock(
    () =>
      ({
        quote: () => {
          calls += 1;
          return hang ? new Promise(() => {}) : Promise.resolve([]);
        },
      }) as unknown as InstanceType<typeof YahooFinance>,
  );
  const client = new YahooFinanceMarketDataClient(factory);
  await client.getLatestEod(['ONE']);
  await client.getLatestEod(['TWO']);
  expect(factory).toHaveBeenCalledTimes(1);
  hang = true;
  await expect(client.getLatestEod(['THREE'])).rejects.toThrow();
  hang = false;
  await client.getLatestEod(['FOUR']);
  expect(factory).toHaveBeenCalledTimes(2);
  expect(calls).toBe(4);
});

test('Yahoo keeps empty quotes for ordinary provider errors', async () => {
  const client = new YahooFinanceMarketDataClient(
    () =>
      ({
        quote: () => Promise.reject(new Error('synthetic quote failure')),
      }) as unknown as InstanceType<typeof YahooFinance>,
  );
  expect((await client.getLatestEod(['SYNTHETIC'])).SYNTHETIC.close).toBeNull();
});
