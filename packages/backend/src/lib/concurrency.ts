export async function forEachConcurrent<T>(
  rows: readonly T[],
  concurrency: number,
  run: (row: T) => Promise<void>,
): Promise<void> {
  if (!Number.isInteger(concurrency) || concurrency < 1)
    throw new Error('Concurrency must be a positive integer');
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, rows.length) }, async () => {
      while (next < rows.length) {
        const row = rows[next++];
        await run(row);
      }
    }),
  );
}
