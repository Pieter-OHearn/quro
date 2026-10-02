import { expect, test } from 'bun:test';
import { forEachConcurrent } from './concurrency';

test('bounded concurrency runs every user exactly once', async () => {
  let active = 0;
  let peak = 0;
  const seen: number[] = [];
  await forEachConcurrent([1, 2, 3, 4, 5, 6, 7], 3, async (id) => {
    active++;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 1));
    seen.push(id);
    active--;
  });
  expect(peak).toBe(3);
  expect(seen.sort()).toEqual([1, 2, 3, 4, 5, 6, 7]);
});
