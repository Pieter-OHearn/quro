import { checkWorkDeadline } from './workDeadline';

// Move the resume position before starting work, so a failed or expired cycle
// gives the next user first place on the following tick.
export function createRotatingWork() {
  let nextId: number | null = null;
  return async (ids: readonly number[], run: (id: number) => Promise<void>): Promise<void> => {
    const ordered = [...ids].sort((a, b) => a - b);
    let start = nextId === null ? 0 : ordered.findIndex((id) => id >= nextId!);
    if (start < 0) start = 0;
    for (let offset = 0; offset < ordered.length; offset += 1) {
      checkWorkDeadline();
      const index = (start + offset) % ordered.length;
      nextId = ordered[(index + 1) % ordered.length];
      await run(ordered[index]);
    }
  };
}
