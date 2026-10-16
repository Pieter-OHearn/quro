import { afterAll, beforeAll, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { db } from '../db/client';
import { workerHeartbeats } from '../db/schema';
import { recordJobFailure } from './jobStatus';
import { JOB_FAILURE_PREFIX } from './operationalStatus';

const name = 'job-status-test';
const rowName = `${JOB_FAILURE_PREFIX}${name}`;
const cleanup = () => db.delete(workerHeartbeats).where(eq(workerHeartbeats.workerName, rowName));

beforeAll(cleanup);
afterAll(cleanup);

test('records a failed cycle as a time only, and a later failure updates the same row', async () => {
  await recordJobFailure(name);
  const [first] = await db
    .select()
    .from(workerHeartbeats)
    .where(eq(workerHeartbeats.workerName, rowName));
  expect(first).toMatchObject({ status: 'failed', parserError: null });

  await new Promise((resolve) => setTimeout(resolve, 5));
  await recordJobFailure(name);
  const rows = await db
    .select()
    .from(workerHeartbeats)
    .where(eq(workerHeartbeats.workerName, rowName));
  expect(rows).toHaveLength(1);
  expect(rows[0]!.lastHeartbeatAt.getTime()).toBeGreaterThan(first!.lastHeartbeatAt.getTime());
});
