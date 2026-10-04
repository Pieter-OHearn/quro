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

test('Yahoo quotes preserve the empty-quote fallback on request timeout', async () => {
  const timeout = AbortSignal.timeout.bind(AbortSignal);
  spyOn(AbortSignal, 'timeout').mockImplementation(() => timeout(10));
  const { client, signal } = hangingClient();
  const quotes = await client.getLatestEod(['SYNTHETIC']);
  expect(quotes.SYNTHETIC?.close).toBeNull();
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
