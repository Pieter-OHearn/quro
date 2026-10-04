import { expect, test } from 'bun:test';
import { abortableRead, upstreamSignal, withWorkDeadline } from './workDeadline';
import { deadlinePostgres } from './deadlinePostgres';

test('request timeout bounds a hanging read and ignores its late result', async () => {
  let finish: (value: string) => void = () => {};
  let writes = 0;
  const read = abortableRead(
    upstreamSignal(10),
    () =>
      new Promise<string>((resolve) => {
        finish = resolve;
      }),
  ).then(() => {
    writes += 1;
  });
  await expect(read).rejects.toThrow();
  finish('late');
  await Bun.sleep(10);
  expect(writes).toBe(0);
});

test('deadline blocks subsequent database work, including transaction queries', async () => {
  let queries = 0;
  type FakeSql = {
    unsafe: () => Promise<never[]>;
    begin: (run: (sql: FakeSql) => Promise<void>) => Promise<void>;
  };
  const raw: FakeSql = {
    unsafe: () => {
      queries += 1;
      return Promise.resolve([]);
    },
    begin: (run: (sql: FakeSql) => Promise<void>) => run(raw),
  };
  const sql = deadlinePostgres(raw);
  await expect(
    withWorkDeadline(10, () =>
      sql.begin(async (tx) => {
        await tx.unsafe();
        await Bun.sleep(25);
        await tx.unsafe();
      }),
    ),
  ).rejects.toThrow('deadline exceeded');
  expect(queries).toBe(1);
  await sql.unsafe();
  expect(queries).toBe(2);
});

test('scope drains in-flight database work before returning a timeout', async () => {
  const { trackWork } = await import('./workDeadline');
  let settled = false;
  const started = Date.now();
  await expect(
    withWorkDeadline(10, async () => {
      // Simulate a query already in progress when another branch fails.
      void trackWork(
        Bun.sleep(40).then(() => {
          settled = true;
        }),
      );
      await Bun.sleep(20);
    }),
  ).rejects.toThrow('deadline exceeded');
  expect(settled).toBe(true);
  expect(Date.now() - started).toBeGreaterThanOrEqual(35);
});

test('a lazy query created before expiry cannot execute after expiry', async () => {
  let queries = 0;
  const sql = deadlinePostgres({
    unsafe: () => ({
      then: (resolve: (value: never[]) => unknown) => {
        queries += 1;
        return Promise.resolve([]).then(resolve);
      },
    }),
  });
  await expect(
    withWorkDeadline(10, async () => {
      const pending = sql.unsafe();
      await Bun.sleep(20);
      await pending;
    }),
  ).rejects.toThrow('deadline exceeded');
  expect(queries).toBe(0);
});

test('tagged queries and transaction callbacks cannot write after scope closure', async () => {
  let queries = 0;
  const raw = Object.assign(
    (_strings: TemplateStringsArray) => ({
      then: (resolve: (value: never[]) => unknown) => {
        queries += 1;
        return Promise.resolve([]).then(resolve);
      },
    }),
    {
      begin: (run: (sql: typeof raw) => Promise<void>) => run(raw),
    },
  );
  const guarded = deadlinePostgres(raw);
  await expect(
    withWorkDeadline(10, async () => {
      await guarded`select 1`;
      await Bun.sleep(20);
      await guarded`late write`;
    }),
  ).rejects.toThrow();
  expect(queries).toBe(1);
});

test('hard grace bounds non-cancellable callbacks and tracked database drains', async () => {
  const { trackWork } = await import('./workDeadline');
  let destroys = 0;
  await expect(
    withWorkDeadline(10, () => new Promise<void>(() => {}), {
      graceMs: 10,
      destroy: () => {
        destroys += 1;
        return Promise.resolve();
      },
    }),
  ).rejects.toThrow('grace period exceeded');
  await expect(
    withWorkDeadline(
      10,
      async () => {
        void trackWork(new Promise<void>(() => {}));
        await Bun.sleep(20);
      },
      { graceMs: 10 },
    ),
  ).rejects.toThrow('grace period exceeded');
  expect(destroys).toBe(1);
});
