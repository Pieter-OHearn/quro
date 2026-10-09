import { afterAll, beforeAll, describe, expect, mock, test } from 'bun:test';
import { DrizzleQueryError } from 'drizzle-orm';

const realSavings = { ...(await import('../services/bunqSavingsSync')) };
const realBudget = { ...(await import('../services/bunqBudgetSync')) };

const databaseFailure = () =>
  new DrizzleQueryError(
    'insert into "savings_transactions" ("amount", "note") values ($1, $2)',
    ['4200.00', 'Salary March'],
    Object.assign(new Error('duplicate key'), { severity: 'ERROR', code: '23505' }),
  );
const bankFailure = () => new Error('Insufficient authentication.');
let failure: () => Error = databaseFailure;

await mock.module('../services/bunqSavingsSync', () => ({
  ...realSavings,
  syncBunqSavings: () => Promise.reject(failure()),
}));
await mock.module('../services/bunqBudgetSync', () => ({
  ...realBudget,
  syncBunqBudget: () => Promise.reject(failure()),
}));

const { createIntegrationHelpers } = await import('../test/integration');
const { db } = await import('../db/client');
const { bunqConnections } = await import('../db/schema');
const { eq } = await import('drizzle-orm');

const integration = createIntegrationHelpers('bunq-sync-errors.integration.quro.test');

let owner: Awaited<ReturnType<typeof integration.signUp>>;

beforeAll(async () => {
  await integration.cleanup();
  owner = await integration.signUp('owner');
  await db
    .insert(bunqConnections)
    .values({ userId: owner.user.id, accessToken: 'token-synthetic' });
});

afterAll(async () => {
  await db.delete(bunqConnections).where(eq(bunqConnections.userId, owner.user.id));
  await mock.module('../services/bunqSavingsSync', () => realSavings);
  await mock.module('../services/bunqBudgetSync', () => realBudget);
  await integration.cleanup();
});

describe('failed bank syncs', () => {
  test.each([
    ['/api/bunq/sync/savings', 'Bunq savings sync failed'],
    ['/api/bunq/sync/budget', 'Bunq budget sync failed'],
  ])('%s does not show the failed statement', async (path, message) => {
    failure = databaseFailure;
    const response = await integration.request(path, { method: 'POST', cookie: owner.cookie });
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: message });
  });

  test('a message from the bank still reaches the user', async () => {
    failure = bankFailure;
    const response = await integration.request('/api/bunq/sync/savings', {
      method: 'POST',
      cookie: owner.cookie,
    });
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Insufficient authentication.' });
  });
});
