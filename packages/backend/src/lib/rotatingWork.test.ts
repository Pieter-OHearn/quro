import { expect, test } from 'bun:test';
import { createRotatingWork } from './rotatingWork';
import { abortableRead, upstreamSignal, withWorkDeadline } from './workDeadline';

test('an expired first user gives later users first place on the next tick', async () => {
  const rotate = createRotatingWork();
  const calls: number[] = [];
  await expect(
    withWorkDeadline(10, () =>
      rotate([3, 1, 2], async (id) => {
        calls.push(id);
        await abortableRead(upstreamSignal(), () => new Promise<void>(() => {}));
      }),
    ),
  ).rejects.toThrow();
  await rotate([1, 2, 3], (id) => {
    calls.push(id);
    return Promise.resolve();
  });
  expect(calls).toEqual([1, 2, 3, 1]);
});
