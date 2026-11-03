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
  // The request times out once the library's first fetch is in flight, not after a timer that
  // a slow machine can outrun before the library reaches fetch.
  const timeout = new AbortController();
  spyOn(AbortSignal, 'timeout').mockImplementation(() => timeout.signal);
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
        timeout.abort(new DOMException('Synthetic request timeout', 'TimeoutError'));
      }),
  ) as unknown as typeof fetch;
  // If the library never reaches fetch, time out anyway so the test fails instead of hanging:
  // bun's per-test timeout does not end a test that waits on a promise nothing will settle.
  const fallback = setTimeout(
    () => timeout.abort(new DOMException('No fetch', 'TimeoutError')),
    2000,
  );
  try {
    await expect(new YahooFinanceMarketDataClient().lookupSymbol('SYNTHETIC')).rejects.toThrow();
    expect(aborted).toBe(true);
  } finally {
    clearTimeout(fallback);
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

function quotingClient(rows: Record<string, unknown>[]) {
  return new YahooFinanceMarketDataClient(
    () => ({ quote: () => Promise.resolve(rows) }) as unknown as InstanceType<typeof YahooFinance>,
  );
}

const QUOTED_AT = new Date('2026-11-03T21:02:27.000Z');

test('Yahoo quotes a US dollar pair it answers under its canonical name', async () => {
  // A batch quote for USDEUR=X sometimes comes back as EUR=X (seen against Yahoo on 2026-11-03).
  const client = quotingClient([
    {
      symbol: 'GBPEUR=X',
      regularMarketPrice: 1.198,
      regularMarketTime: QUOTED_AT,
      currency: 'EUR',
    },
    { symbol: 'EUR=X', regularMarketPrice: 0.8933, regularMarketTime: QUOTED_AT, currency: 'EUR' },
  ]);
  const quotes = await client.getLatestEod(['GBPEUR=X', 'USDEUR=X']);
  expect(quotes['USDEUR=X']).toMatchObject({
    symbol: 'USDEUR=X',
    close: 0.8933,
    eodDate: '2026-11-03',
  });
  expect(quotes['GBPEUR=X']?.close).toBe(1.198);
  expect(quotes['EUR=X']).toBeUndefined();
});

test('Yahoo keeps an exact symbol match over the US dollar pair name', async () => {
  const client = quotingClient([
    { symbol: 'EUR=X', regularMarketPrice: 0.8933, regularMarketTime: QUOTED_AT, currency: 'EUR' },
  ]);
  const quotes = await client.getLatestEod(['EUR=X', 'USDEUR=X']);
  expect(quotes['EUR=X']?.close).toBe(0.8933);
  expect(quotes['USDEUR=X']?.close).toBeNull();
});
