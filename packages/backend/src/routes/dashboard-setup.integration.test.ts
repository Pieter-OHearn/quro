import { afterAll, beforeAll, expect, test } from 'bun:test';
import type { SetupProgress } from '@quro/shared';
import { db } from '../db/client';
import { savingsAccounts, savingsTransactions } from '../db/schema';
import { createIntegrationHelpers, insertPartnerLink } from '../test/integration';

const integration = createIntegrationHelpers('setup-progress.integration.quro.test');
beforeAll(() => integration.cleanup());
afterAll(() => integration.cleanup());

async function progressFor(cookie: string): Promise<SetupProgress> {
  const response = await integration.request('/api/dashboard/setup', { cookie });
  expect(response.status).toBe(200);
  return ((await response.json()) as { data: SetupProgress }).data;
}

async function addAccount(userId: number, name: string, isJoint = false) {
  const [account] = await db
    .insert(savingsAccounts)
    .values({
      userId,
      name,
      bank: 'Synthetic bank',
      balance: 0,
      currency: 'EUR',
      interestRate: 0,
      accountType: 'Easy Access',
      isJoint,
    })
    .returning({ id: savingsAccounts.id });
  return account.id;
}

function addDeposit(userId: number, accountId: number) {
  return db.insert(savingsTransactions).values({
    userId,
    accountId,
    type: 'deposit',
    amount: 10,
    date: '2026-03-01',
  });
}

test('a new household has neither an account nor a transaction, and each shows once recorded', async () => {
  const user = await integration.signUp('own');
  expect(await progressFor(user.cookie)).toEqual({ hasAccount: false, hasTransaction: false });

  const accountId = await addAccount(user.user.id, 'First account');
  expect(await progressFor(user.cookie)).toEqual({ hasAccount: true, hasTransaction: false });

  await addDeposit(user.user.id, accountId);
  expect(await progressFor(user.cookie)).toEqual({ hasAccount: true, hasTransaction: true });
});

test('an accepted partner contributes joint rows only, and other households contribute nothing', async () => {
  const user = await integration.signUp('household-a');
  const partner = await integration.signUp('household-b');
  const stranger = await integration.signUp('household-c');
  const strangerAccount = await addAccount(stranger.user.id, 'Stranger account', true);
  await addDeposit(stranger.user.id, strangerAccount);
  const privateAccount = await addAccount(partner.user.id, 'Private account');
  await addDeposit(partner.user.id, privateAccount);
  await insertPartnerLink(user.user.id, partner.user.id, 'accepted');

  expect(await progressFor(user.cookie)).toEqual({ hasAccount: false, hasTransaction: false });

  const jointAccount = await addAccount(partner.user.id, 'Joint account', true);
  expect(await progressFor(user.cookie)).toEqual({ hasAccount: true, hasTransaction: false });

  await addDeposit(partner.user.id, jointAccount);
  expect(await progressFor(user.cookie)).toEqual({ hasAccount: true, hasTransaction: true });
});

test('a pending partner link shares nothing', async () => {
  const user = await integration.signUp('pending-a');
  const partner = await integration.signUp('pending-b');
  const account = await addAccount(partner.user.id, 'Joint account', true);
  await addDeposit(partner.user.id, account);
  await insertPartnerLink(user.user.id, partner.user.id, 'pending');

  expect(await progressFor(user.cookie)).toEqual({ hasAccount: false, hasTransaction: false });
});
