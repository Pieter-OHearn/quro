import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { db } from '../db/client';
import { budgetCategories, budgetTransactions, categoryMappings } from '../db/schema';
import { createIntegrationHelpers, integrationPassword } from '../test/integration';

const integration = createIntegrationHelpers('ticket6.integration.quro.test');
const SIGNIN_ALLOWED_ATTEMPTS = 5;
const SIGNUP_ALLOWED_ATTEMPTS = 3;

function restoreNodeEnv(previousNodeEnv: string | undefined) {
  if (previousNodeEnv === undefined) {
    delete process.env.NODE_ENV;
  } else {
    process.env.NODE_ENV = previousNodeEnv;
  }
}

beforeAll(async () => {
  await integration.cleanup();
});

afterAll(async () => {
  await integration.cleanup();
});

describe('auth integration', () => {
  test('rate limits repeated signin attempts', async () => {
    const owner = await integration.signUp('signin-rate-limit');
    const previousNodeEnv = process.env.NODE_ENV;
    const isolatedIp = `signin-rate-limit-${crypto.randomUUID()}`;

    try {
      process.env.NODE_ENV = 'development';
      for (let attempt = 0; attempt < SIGNIN_ALLOWED_ATTEMPTS; attempt += 1) {
        const response = await integration.request('/api/auth/signin', {
          method: 'POST',
          headers: { 'x-real-ip': isolatedIp },
          json: { email: owner.user.email, password: 'wrong-password' },
        });
        expect(response.status).toBe(401);
      }

      const limitedResponse = await integration.request('/api/auth/signin', {
        method: 'POST',
        headers: { 'x-real-ip': isolatedIp },
        json: { email: owner.user.email, password: 'wrong-password' },
      });
      expect(limitedResponse.status).toBe(429);
      expect(await limitedResponse.json()).toEqual({
        error: 'Too many requests, please try again later',
      });
    } finally {
      restoreNodeEnv(previousNodeEnv);
    }
  });

  test('rate limits repeated signup attempts', async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    const isolatedIp = `signup-rate-limit-${crypto.randomUUID()}`;

    try {
      process.env.NODE_ENV = 'development';
      for (let attempt = 0; attempt < SIGNUP_ALLOWED_ATTEMPTS; attempt += 1) {
        const response = await integration.request('/api/auth/signup', {
          method: 'POST',
          headers: { 'x-real-ip': isolatedIp },
          json: {
            firstName: 'Signup',
            lastName: 'Limiter',
            email: integration.buildEmail(`signup-rate-limit-${attempt}`),
            password: integrationPassword,
            age: 31,
            retirementAge: 67,
          },
        });
        expect(response.status).toBe(201);
      }

      const limitedResponse = await integration.request('/api/auth/signup', {
        method: 'POST',
        headers: { 'x-real-ip': isolatedIp },
        json: {
          firstName: 'Signup',
          lastName: 'Limiter',
          email: integration.buildEmail('signup-rate-limit-blocked'),
          password: integrationPassword,
          age: 31,
          retirementAge: 67,
        },
      });
      expect(limitedResponse.status).toBe(429);
      expect(await limitedResponse.json()).toEqual({
        error: 'Too many requests, please try again later',
      });
    } finally {
      restoreNodeEnv(previousNodeEnv);
    }
  });

  test('supports signup, session reuse, signout, and signin', async () => {
    const signupEmail = integration.buildEmail('auth-session');
    const signupResponse = await integration.request('/api/auth/signup', {
      method: 'POST',
      json: {
        firstName: 'Auth',
        lastName: 'Flow',
        email: signupEmail.toUpperCase(),
        password: integrationPassword,
        age: 31,
        retirementAge: 67,
      },
    });

    expect(signupResponse.status).toBe(201);
    const signupBody = (await signupResponse.json()) as {
      data: {
        email: string;
      };
    };
    const signupCookie = signupResponse.headers.get('set-cookie')?.split(';', 1)[0] ?? null;

    expect(signupBody.data.email).toBe(signupEmail);
    expect(signupCookie).toBeTruthy();

    const meResponse = await integration.request('/api/auth/me', {
      cookie: signupCookie,
    });
    expect(meResponse.status).toBe(200);
    const meBody = (await meResponse.json()) as {
      data: {
        email: string;
      };
    };
    expect(meBody.data.email).toBe(signupEmail);

    const signoutResponse = await integration.request('/api/auth/signout', {
      method: 'POST',
      cookie: signupCookie,
    });
    expect(signoutResponse.status).toBe(200);
    expect(await signoutResponse.json()).toEqual({ ok: true });

    const afterSignoutResponse = await integration.request('/api/auth/me', {
      cookie: signupCookie,
    });
    expect(afterSignoutResponse.status).toBe(200);
    expect(await afterSignoutResponse.json()).toEqual({ data: null });

    const signinResponse = await integration.request('/api/auth/signin', {
      method: 'POST',
      json: {
        email: signupEmail.toUpperCase(),
        password: integrationPassword,
      },
    });
    expect(signinResponse.status).toBe(200);
    const signinCookie = signinResponse.headers.get('set-cookie')?.split(';', 1)[0] ?? null;
    expect(signinCookie).toBeTruthy();

    const protectedResponse = await integration.request('/api/goals', {
      cookie: signinCookie,
    });
    expect(protectedResponse.status).toBe(200);
    expect(await protectedResponse.json()).toEqual({ data: [] });
  });

  test('returns conflict instead of an unhandled error for concurrent duplicate signup', async () => {
    const email = integration.buildEmail('concurrent-signup');
    const signup = () =>
      integration.request('/api/auth/signup', {
        method: 'POST',
        json: {
          firstName: 'Concurrent',
          lastName: 'Signup',
          email,
          password: integrationPassword,
          age: 31,
          retirementAge: 67,
        },
      });

    const responses = await Promise.all([signup(), signup()]);
    expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);

    const conflict = responses.find((response) => response.status === 409);
    expect(await conflict?.json()).toEqual({
      error: 'An account with this email already exists',
    });
  });

  test('rejects invalid auth payloads and unauthenticated protected requests', async () => {
    const weakPasswordResponse = await integration.request('/api/auth/signup', {
      method: 'POST',
      json: {
        firstName: 'Invalid',
        lastName: 'Signup',
        email: integration.buildEmail('weak-password'),
        password: 'short',
        age: 29,
        retirementAge: 66,
      },
    });

    expect(weakPasswordResponse.status).toBe(400);
    expect(await weakPasswordResponse.json()).toEqual({
      error: 'Password must be at least 8 characters',
    });

    const protectedResponse = await integration.request('/api/savings/accounts');
    expect(protectedResponse.status).toBe(401);
    expect(await protectedResponse.json()).toEqual({
      error: 'Authentication required',
    });

    // The bunq callback is public but authenticates the user via the HMAC-signed
    // `state` param. An unsigned/forged state is rejected with a redirect to the
    // settings error page rather than processed.
    const bunqCallbackResponse = await integration.request(
      '/api/bunq/oauth/callback?state=state&code=code',
    );
    expect(bunqCallbackResponse.status).toBe(302);
    expect(bunqCallbackResponse.headers.get('location')).toContain('bunq=error');
  });
});

describe('savings integration', () => {
  test('covers account and transaction CRUD with balance sync', async () => {
    const owner = await integration.signUp('savings-owner');

    const createPrimaryAccountResponse = await integration.request('/api/savings/accounts', {
      method: 'POST',
      cookie: owner.cookie,
      json: {
        name: 'Emergency Fund',
        bank: 'Monzo',
        balance: 1000,
        currency: 'EUR',
        interestRate: 2.1,
        accountType: 'Easy Access',
        color: '#2563eb',
        emoji: 'S',
      },
    });
    expect(createPrimaryAccountResponse.status).toBe(201);
    const primaryAccount = (await createPrimaryAccountResponse.json()) as {
      data: {
        id: number;
        balance: string;
      };
    };

    const createSecondaryAccountResponse = await integration.request('/api/savings/accounts', {
      method: 'POST',
      cookie: owner.cookie,
      json: {
        name: 'Holiday Pot',
        bank: 'Starling',
        balance: 200,
        currency: 'EUR',
        interestRate: 1.4,
        accountType: 'Term Deposit',
        color: '#059669',
        emoji: 'H',
      },
    });
    expect(createSecondaryAccountResponse.status).toBe(201);
    const secondaryAccount = (await createSecondaryAccountResponse.json()) as {
      data: {
        id: number;
        balance: string;
      };
    };

    const accountsResponse = await integration.request('/api/savings/accounts', {
      cookie: owner.cookie,
    });
    expect(accountsResponse.status).toBe(200);
    const accountsBody = (await accountsResponse.json()) as {
      data: Array<{ id: number }>;
    };
    expect(accountsBody.data.map((account) => account.id).sort((a, b) => a - b)).toEqual([
      primaryAccount.data.id,
      secondaryAccount.data.id,
    ]);

    const updateAccountResponse = await integration.request(
      `/api/savings/accounts/${primaryAccount.data.id}`,
      {
        method: 'PATCH',
        cookie: owner.cookie,
        json: {
          name: 'Emergency Reserve',
          bank: 'Monzo Premium',
          userId: owner.user.id + 999,
        },
      },
    );
    expect(updateAccountResponse.status).toBe(200);
    const updatedAccount = (await updateAccountResponse.json()) as {
      data: {
        name: string;
        bank: string;
      };
    };
    expect(updatedAccount.data).toMatchObject({
      name: 'Emergency Reserve',
      bank: 'Monzo Premium',
    });

    const createTransactionResponse = await integration.request('/api/savings/transactions', {
      method: 'POST',
      cookie: owner.cookie,
      json: {
        accountId: primaryAccount.data.id,
        type: 'deposit',
        amount: 250,
        date: '2026-03-10',
        note: 'Bonus transfer',
      },
    });
    expect(createTransactionResponse.status).toBe(201);
    const createdTransaction = (await createTransactionResponse.json()) as {
      data: {
        id: number;
        accountId: number;
        amount: string;
        type: string;
      };
    };
    expect(createdTransaction.data).toMatchObject({
      accountId: primaryAccount.data.id,
      type: 'deposit',
    });
    expect(Number(createdTransaction.data.amount)).toBe(250);

    const primaryAccountAfterDepositResponse = await integration.request(
      `/api/savings/accounts/${primaryAccount.data.id}`,
      {
        cookie: owner.cookie,
      },
    );
    const primaryAccountAfterDeposit = (await primaryAccountAfterDepositResponse.json()) as {
      data: {
        balance: string;
      };
    };
    expect(Number(primaryAccountAfterDeposit.data.balance)).toBe(1250);

    const filteredTransactionsResponse = await integration.request(
      `/api/savings/transactions?accountId=${primaryAccount.data.id}`,
      {
        cookie: owner.cookie,
      },
    );
    expect(filteredTransactionsResponse.status).toBe(200);
    const filteredTransactions = (await filteredTransactionsResponse.json()) as {
      data: Array<{ id: number }>;
    };
    expect(filteredTransactions.data.map((transaction) => transaction.id)).toEqual([
      createdTransaction.data.id,
    ]);

    const updateTransactionResponse = await integration.request(
      `/api/savings/transactions/${createdTransaction.data.id}`,
      {
        method: 'PATCH',
        cookie: owner.cookie,
        json: {
          accountId: secondaryAccount.data.id,
          type: 'withdrawal',
          amount: 100,
          note: 'Moved to travel budget',
        },
      },
    );
    expect(updateTransactionResponse.status).toBe(200);
    const updatedTransaction = (await updateTransactionResponse.json()) as {
      data: {
        accountId: number;
        type: string;
        amount: string;
        note: string | null;
      };
    };
    expect(updatedTransaction.data).toMatchObject({
      accountId: secondaryAccount.data.id,
      type: 'withdrawal',
      note: 'Moved to travel budget',
    });
    expect(Number(updatedTransaction.data.amount)).toBe(100);

    const primaryAccountAfterMoveResponse = await integration.request(
      `/api/savings/accounts/${primaryAccount.data.id}`,
      {
        cookie: owner.cookie,
      },
    );
    const primaryAccountAfterMove = (await primaryAccountAfterMoveResponse.json()) as {
      data: {
        balance: string;
      };
    };
    expect(Number(primaryAccountAfterMove.data.balance)).toBe(1000);

    const secondaryAccountAfterMoveResponse = await integration.request(
      `/api/savings/accounts/${secondaryAccount.data.id}`,
      {
        cookie: owner.cookie,
      },
    );
    const secondaryAccountAfterMove = (await secondaryAccountAfterMoveResponse.json()) as {
      data: {
        balance: string;
      };
    };
    expect(Number(secondaryAccountAfterMove.data.balance)).toBe(100);

    const deleteTransactionResponse = await integration.request(
      `/api/savings/transactions/${createdTransaction.data.id}`,
      {
        method: 'DELETE',
        cookie: owner.cookie,
      },
    );
    expect(deleteTransactionResponse.status).toBe(200);

    const secondaryAccountAfterDeleteResponse = await integration.request(
      `/api/savings/accounts/${secondaryAccount.data.id}`,
      {
        cookie: owner.cookie,
      },
    );
    const secondaryAccountAfterDelete = (await secondaryAccountAfterDeleteResponse.json()) as {
      data: {
        balance: string;
      };
    };
    expect(Number(secondaryAccountAfterDelete.data.balance)).toBe(200);

    const deletedTransactionLookupResponse = await integration.request(
      `/api/savings/transactions/${createdTransaction.data.id}`,
      {
        cookie: owner.cookie,
      },
    );
    expect(deletedTransactionLookupResponse.status).toBe(404);
    expect(await deletedTransactionLookupResponse.json()).toEqual({
      error: 'Transaction not found',
    });

    const deletePrimaryAccountResponse = await integration.request(
      `/api/savings/accounts/${primaryAccount.data.id}`,
      {
        method: 'DELETE',
        cookie: owner.cookie,
      },
    );
    expect(deletePrimaryAccountResponse.status).toBe(200);

    const deleteSecondaryAccountResponse = await integration.request(
      `/api/savings/accounts/${secondaryAccount.data.id}`,
      {
        method: 'DELETE',
        cookie: owner.cookie,
      },
    );
    expect(deleteSecondaryAccountResponse.status).toBe(200);

    const deletedAccountLookupResponse = await integration.request(
      `/api/savings/accounts/${primaryAccount.data.id}`,
      {
        cookie: owner.cookie,
      },
    );
    expect(deletedAccountLookupResponse.status).toBe(404);
    expect(await deletedAccountLookupResponse.json()).toEqual({
      error: 'Account not found',
    });
  });

  test('removes savings accounts without deleting transactions unless cascade is explicit', async () => {
    const owner = await integration.signUp('savings-remove-preserve');

    const createAccountResponse = await integration.request('/api/savings/accounts', {
      method: 'POST',
      cookie: owner.cookie,
      json: {
        name: 'Closed Reserve',
        bank: 'Monzo',
        balance: 300,
        currency: 'EUR',
        interestRate: 1.2,
        accountType: 'Easy Access',
        color: '#2563eb',
        emoji: 'R',
      },
    });
    expect(createAccountResponse.status).toBe(201);
    const account = (await createAccountResponse.json()) as {
      data: {
        id: number;
      };
    };

    const createTransactionResponse = await integration.request('/api/savings/transactions', {
      method: 'POST',
      cookie: owner.cookie,
      json: {
        accountId: account.data.id,
        type: 'deposit',
        amount: 75,
        date: '2026-03-20',
        note: 'Historical top up',
      },
    });
    expect(createTransactionResponse.status).toBe(201);
    const transaction = (await createTransactionResponse.json()) as {
      data: {
        id: number;
      };
    };

    const removeAccountResponse = await integration.request(
      `/api/savings/accounts/${account.data.id}`,
      {
        method: 'DELETE',
        cookie: owner.cookie,
      },
    );
    expect(removeAccountResponse.status).toBe(200);
    const removedAccount = (await removeAccountResponse.json()) as {
      data: {
        archivedAt: string | null;
      };
    };
    expect(removedAccount.data.archivedAt).toBeTruthy();

    const activeAccountsResponse = await integration.request('/api/savings/accounts', {
      cookie: owner.cookie,
    });
    expect(activeAccountsResponse.status).toBe(200);
    const activeAccounts = (await activeAccountsResponse.json()) as {
      data: Array<{ id: number }>;
    };
    expect(activeAccounts.data.some((row) => row.id === account.data.id)).toBe(false);

    const transactionsResponse = await integration.request('/api/savings/transactions', {
      cookie: owner.cookie,
    });
    expect(transactionsResponse.status).toBe(200);
    const transactions = (await transactionsResponse.json()) as {
      data: Array<{ id: number; accountId: number }>;
    };
    const preservedTransaction = transactions.data.find((row) => row.id === transaction.data.id);
    expect(preservedTransaction).toMatchObject({
      id: transaction.data.id,
      accountId: account.data.id,
    });

    const cascadeDeleteResponse = await integration.request(
      `/api/savings/accounts/${account.data.id}?cascade=true`,
      {
        method: 'DELETE',
        cookie: owner.cookie,
      },
    );
    expect(cascadeDeleteResponse.status).toBe(200);

    const deletedTransactionLookupResponse = await integration.request(
      `/api/savings/transactions/${transaction.data.id}`,
      {
        cookie: owner.cookie,
      },
    );
    expect(deletedTransactionLookupResponse.status).toBe(404);
  });

  test('enforces account ownership and rejects invalid transaction account ids', async () => {
    const owner = await integration.signUp('savings-cross-owner');
    const intruder = await integration.signUp('savings-cross-intruder');

    const createAccountResponse = await integration.request('/api/savings/accounts', {
      method: 'POST',
      cookie: owner.cookie,
      json: {
        name: 'Bills',
        bank: 'Revolut',
        balance: 500,
        currency: 'EUR',
        interestRate: 0.5,
        accountType: 'Easy Access',
        color: '#7c3aed',
        emoji: 'B',
      },
    });
    const ownerAccount = (await createAccountResponse.json()) as {
      data: {
        id: number;
      };
    };

    const createTransactionResponse = await integration.request('/api/savings/transactions', {
      method: 'POST',
      cookie: owner.cookie,
      json: {
        accountId: ownerAccount.data.id,
        type: 'deposit',
        amount: 40,
        date: '2026-03-11',
        note: 'Top up',
      },
    });
    const ownerTransaction = (await createTransactionResponse.json()) as {
      data: {
        id: number;
      };
    };

    const crossUserAccountResponse = await integration.request(
      `/api/savings/accounts/${ownerAccount.data.id}`,
      {
        cookie: intruder.cookie,
      },
    );
    expect(crossUserAccountResponse.status).toBe(404);
    expect(await crossUserAccountResponse.json()).toEqual({
      error: 'Account not found',
    });

    const crossUserCreateTransactionResponse = await integration.request(
      '/api/savings/transactions',
      {
        method: 'POST',
        cookie: intruder.cookie,
        json: {
          accountId: ownerAccount.data.id,
          type: 'deposit',
          amount: 20,
          date: '2026-03-11',
          note: 'Should fail',
        },
      },
    );
    expect(crossUserCreateTransactionResponse.status).toBe(404);
    expect(await crossUserCreateTransactionResponse.json()).toEqual({
      error: 'Account not found',
    });

    const invalidAccountIdResponse = await integration.request(
      `/api/savings/transactions/${ownerTransaction.data.id}`,
      {
        method: 'PATCH',
        cookie: owner.cookie,
        json: {
          accountId: 0,
        },
      },
    );
    expect(invalidAccountIdResponse.status).toBe(400);
    expect(await invalidAccountIdResponse.json()).toEqual({
      error: 'Invalid account id',
    });
  });

  test('rejects invalid savings payloads', async () => {
    const owner = await integration.signUp('savings-validation');

    const invalidAccountResponse = await integration.request('/api/savings/accounts', {
      method: 'POST',
      cookie: owner.cookie,
      json: {
        name: '   ',
        bank: 'Monzo',
        balance: 100,
        currency: 'EUR',
        interestRate: 1.5,
        accountType: 'Easy Access',
        color: '#2563eb',
        emoji: 'S',
      },
    });
    expect(invalidAccountResponse.status).toBe(400);
    expect(await invalidAccountResponse.json()).toEqual({
      error: 'Account name is required',
    });

    const createAccountResponse = await integration.request('/api/savings/accounts', {
      method: 'POST',
      cookie: owner.cookie,
      json: {
        name: 'Buffer',
        bank: 'Starling',
        balance: 900,
        currency: 'EUR',
        interestRate: 1.1,
        accountType: 'Easy Access',
        color: '#14b8a6',
        emoji: 'B',
      },
    });
    const account = (await createAccountResponse.json()) as {
      data: {
        id: number;
      };
    };

    const invalidCurrencyResponse = await integration.request('/api/savings/accounts', {
      method: 'POST',
      cookie: owner.cookie,
      json: {
        name: 'Foreign',
        bank: 'Wise',
        balance: 400,
        currency: 'SEK',
        interestRate: 0.9,
        accountType: 'Easy Access',
        color: '#6366f1',
        emoji: 'F',
      },
    });
    expect(invalidCurrencyResponse.status).toBe(400);
    expect(await invalidCurrencyResponse.json()).toEqual({
      error: 'Invalid currency',
    });

    const invalidTransactionTypeResponse = await integration.request('/api/savings/transactions', {
      method: 'POST',
      cookie: owner.cookie,
      json: {
        accountId: account.data.id,
        type: 'transfer',
        amount: 50,
        date: '2026-03-11',
        note: 'Bad type',
      },
    });
    expect(invalidTransactionTypeResponse.status).toBe(400);
    expect(await invalidTransactionTypeResponse.json()).toEqual({
      error: 'Invalid transaction type',
    });

    const invalidTransactionDateResponse = await integration.request('/api/savings/transactions', {
      method: 'POST',
      cookie: owner.cookie,
      json: {
        accountId: account.data.id,
        type: 'deposit',
        amount: 50,
        date: '2026-02-30',
        note: 'Bad date',
      },
    });
    expect(invalidTransactionDateResponse.status).toBe(400);
    expect(await invalidTransactionDateResponse.json()).toEqual({
      error: 'Transaction date must be a valid ISO date',
    });

    const unknownFieldPatchResponse = await integration.request(
      `/api/savings/accounts/${account.data.id}`,
      {
        method: 'PATCH',
        cookie: owner.cookie,
        json: {
          nickname: 'Rainy Day',
        },
      },
    );
    expect(unknownFieldPatchResponse.status).toBe(400);
    expect(await unknownFieldPatchResponse.json()).toEqual({
      error: 'Unknown field: nickname',
    });
  });
});

describe('budget integration', () => {
  test('bounds unfiltered transaction history while preserving newest-first order', async () => {
    const owner = await integration.signUp('budget-bounded-history');
    const [category] = await db
      .insert(budgetCategories)
      .values({
        userId: owner.user.id,
        name: 'History',
        emoji: 'H',
        budgeted: 1000,
        spent: 0,
        color: '#475569',
        month: 'Jan',
        year: 2026,
      })
      .returning({ id: budgetCategories.id });
    const inserted = await db
      .insert(budgetTransactions)
      .values(
        Array.from({ length: 105 }, (_, index) => ({
          userId: owner.user.id,
          categoryId: category.id,
          description: `Transaction ${index}`,
          amount: 1,
          date: '2026-01-01',
          merchant: 'History Test',
        })),
      )
      .returning({ id: budgetTransactions.id });

    const response = await integration.request('/api/budget/transactions', {
      cookie: owner.cookie,
    });
    const body = (await response.json()) as { data: Array<{ id: number }> };

    expect(response.status).toBe(200);
    expect(body.data).toHaveLength(100);
    expect(body.data.map((transaction) => transaction.id)).toEqual(
      inserted
        .map((transaction) => transaction.id)
        .reverse()
        .slice(0, 100),
    );
  });

  test('covers category and transaction CRUD', async () => {
    const owner = await integration.signUp('budget-owner');

    const createCategoryResponse = await integration.request('/api/budget/categories', {
      method: 'POST',
      cookie: owner.cookie,
      json: {
        name: 'Groceries',
        emoji: 'G',
        budgeted: 450,
        spent: 120,
        color: '#f59e0b',
        month: 'Mar',
        year: 2026,
      },
    });
    expect(createCategoryResponse.status).toBe(201);
    const createdCategory = (await createCategoryResponse.json()) as {
      data: {
        id: number;
        budgeted: string;
        spent: string;
      };
    };
    expect(Number(createdCategory.data.budgeted)).toBe(450);
    expect(Number(createdCategory.data.spent)).toBe(120);

    const createSecondCategoryResponse = await integration.request('/api/budget/categories', {
      method: 'POST',
      cookie: owner.cookie,
      json: {
        name: 'Dining',
        emoji: 'D',
        budgeted: 200,
        spent: 0,
        color: '#ef4444',
        month: 'Mar',
        year: 2026,
      },
    });
    const secondCategory = (await createSecondCategoryResponse.json()) as {
      data: {
        id: number;
      };
    };

    const updateCategoryResponse = await integration.request(
      `/api/budget/categories/${createdCategory.data.id}`,
      {
        method: 'PATCH',
        cookie: owner.cookie,
        json: {
          budgeted: 500,
          spent: 150,
        },
      },
    );
    expect(updateCategoryResponse.status).toBe(200);
    const updatedCategory = (await updateCategoryResponse.json()) as {
      data: {
        budgeted: string;
        spent: string;
      };
    };
    expect(Number(updatedCategory.data.budgeted)).toBe(500);
    expect(Number(updatedCategory.data.spent)).toBe(150);

    const categoryLookupResponse = await integration.request(
      `/api/budget/categories/${createdCategory.data.id}`,
      {
        cookie: owner.cookie,
      },
    );
    expect(categoryLookupResponse.status).toBe(200);

    const createTransactionResponse = await integration.request('/api/budget/transactions', {
      method: 'POST',
      cookie: owner.cookie,
      json: {
        categoryId: createdCategory.data.id,
        description: 'Weekly shop',
        amount: 89.5,
        date: '2026-03-09',
        merchant: 'Albert Heijn',
      },
    });
    expect(createTransactionResponse.status).toBe(201);
    const createdTransaction = (await createTransactionResponse.json()) as {
      data: {
        id: number;
        categoryId: number;
        amount: string;
      };
    };
    expect(Number(createdTransaction.data.amount)).toBe(89.5);

    const categoryAfterCreateResponse = await integration.request(
      `/api/budget/categories/${createdCategory.data.id}`,
      {
        cookie: owner.cookie,
      },
    );
    expect(categoryAfterCreateResponse.status).toBe(200);
    const categoryAfterCreate = (await categoryAfterCreateResponse.json()) as {
      data: {
        spent: string;
      };
    };
    expect(Number(categoryAfterCreate.data.spent)).toBe(239.5);

    const deleteInUseCategoryResponse = await integration.request(
      `/api/budget/categories/${createdCategory.data.id}`,
      {
        method: 'DELETE',
        cookie: owner.cookie,
      },
    );
    expect(deleteInUseCategoryResponse.status).toBe(409);
    expect(await deleteInUseCategoryResponse.json()).toEqual({
      error: 'Cannot delete a category with existing transactions',
    });

    const inUseCategoryLookupResponse = await integration.request(
      `/api/budget/categories/${createdCategory.data.id}`,
      { cookie: owner.cookie },
    );
    expect(inUseCategoryLookupResponse.status).toBe(200);

    const renameTransactionResponse = await integration.request(
      `/api/budget/transactions/${createdTransaction.data.id}`,
      {
        method: 'PATCH',
        cookie: owner.cookie,
        json: {
          merchant: 'AH',
        },
      },
    );
    expect(renameTransactionResponse.status).toBe(200);

    const categoryAfterRenameResponse = await integration.request(
      `/api/budget/categories/${createdCategory.data.id}`,
      {
        cookie: owner.cookie,
      },
    );
    expect(categoryAfterRenameResponse.status).toBe(200);
    const categoryAfterRename = (await categoryAfterRenameResponse.json()) as {
      data: {
        spent: string;
      };
    };
    expect(Number(categoryAfterRename.data.spent)).toBe(239.5);

    const filteredTransactionsResponse = await integration.request(
      `/api/budget/transactions?categoryId=${createdCategory.data.id}`,
      {
        cookie: owner.cookie,
      },
    );
    expect(filteredTransactionsResponse.status).toBe(200);
    const filteredTransactions = (await filteredTransactionsResponse.json()) as {
      data: Array<{ id: number }>;
    };
    expect(filteredTransactions.data.map((transaction) => transaction.id)).toEqual([
      createdTransaction.data.id,
    ]);

    const updateTransactionResponse = await integration.request(
      `/api/budget/transactions/${createdTransaction.data.id}`,
      {
        method: 'PATCH',
        cookie: owner.cookie,
        json: {
          categoryId: secondCategory.data.id,
          description: 'Team dinner',
          amount: 120.75,
          merchant: 'Cafe de Pijp',
        },
      },
    );
    expect(updateTransactionResponse.status).toBe(200);
    const updatedTransaction = (await updateTransactionResponse.json()) as {
      data: {
        categoryId: number;
        description: string;
        amount: string;
        merchant: string;
      };
    };
    expect(updatedTransaction.data).toMatchObject({
      categoryId: secondCategory.data.id,
      description: 'Team dinner',
      merchant: 'Cafe de Pijp',
    });
    expect(Number(updatedTransaction.data.amount)).toBe(120.75);

    const firstCategoryAfterUpdateResponse = await integration.request(
      `/api/budget/categories/${createdCategory.data.id}`,
      {
        cookie: owner.cookie,
      },
    );
    expect(firstCategoryAfterUpdateResponse.status).toBe(200);
    const firstCategoryAfterUpdate = (await firstCategoryAfterUpdateResponse.json()) as {
      data: {
        spent: string;
      };
    };
    expect(Number(firstCategoryAfterUpdate.data.spent)).toBe(150);

    const secondCategoryAfterUpdateResponse = await integration.request(
      `/api/budget/categories/${secondCategory.data.id}`,
      {
        cookie: owner.cookie,
      },
    );
    expect(secondCategoryAfterUpdateResponse.status).toBe(200);
    const secondCategoryAfterUpdate = (await secondCategoryAfterUpdateResponse.json()) as {
      data: {
        spent: string;
      };
    };
    expect(Number(secondCategoryAfterUpdate.data.spent)).toBe(120.75);

    const transactionLookupResponse = await integration.request(
      `/api/budget/transactions/${createdTransaction.data.id}`,
      {
        cookie: owner.cookie,
      },
    );
    expect(transactionLookupResponse.status).toBe(200);

    const deleteTransactionResponse = await integration.request(
      `/api/budget/transactions/${createdTransaction.data.id}`,
      {
        method: 'DELETE',
        cookie: owner.cookie,
      },
    );
    expect(deleteTransactionResponse.status).toBe(200);

    const secondCategoryAfterDeleteResponse = await integration.request(
      `/api/budget/categories/${secondCategory.data.id}`,
      {
        cookie: owner.cookie,
      },
    );
    expect(secondCategoryAfterDeleteResponse.status).toBe(200);
    const secondCategoryAfterDelete = (await secondCategoryAfterDeleteResponse.json()) as {
      data: {
        spent: string;
      };
    };
    expect(Number(secondCategoryAfterDelete.data.spent)).toBe(0);

    const deleteFirstCategoryResponse = await integration.request(
      `/api/budget/categories/${createdCategory.data.id}`,
      {
        method: 'DELETE',
        cookie: owner.cookie,
      },
    );
    expect(deleteFirstCategoryResponse.status).toBe(200);

    const deleteSecondCategoryResponse = await integration.request(
      `/api/budget/categories/${secondCategory.data.id}`,
      {
        method: 'DELETE',
        cookie: owner.cookie,
      },
    );
    expect(deleteSecondCategoryResponse.status).toBe(200);

    const deletedCategoryLookupResponse = await integration.request(
      `/api/budget/categories/${createdCategory.data.id}`,
      {
        cookie: owner.cookie,
      },
    );
    expect(deletedCategoryLookupResponse.status).toBe(404);
    expect(await deletedCategoryLookupResponse.json()).toEqual({
      error: 'Category not found',
    });
  });

  test('enforces category ownership on create and update', async () => {
    const owner = await integration.signUp('budget-cross-owner');
    const intruder = await integration.signUp('budget-cross-intruder');

    const ownerCategoryResponse = await integration.request('/api/budget/categories', {
      method: 'POST',
      cookie: owner.cookie,
      json: {
        name: 'Transport',
        emoji: 'T',
        budgeted: 180,
        spent: 40,
        color: '#0ea5e9',
        month: 'Mar',
        year: 2026,
      },
    });
    const ownerCategory = (await ownerCategoryResponse.json()) as {
      data: {
        id: number;
      };
    };

    const intruderCategoryResponse = await integration.request('/api/budget/categories', {
      method: 'POST',
      cookie: intruder.cookie,
      json: {
        name: 'Private',
        emoji: 'P',
        budgeted: 90,
        spent: 0,
        color: '#a855f7',
        month: 'Mar',
        year: 2026,
      },
    });
    const intruderCategory = (await intruderCategoryResponse.json()) as {
      data: {
        id: number;
      };
    };

    const ownerTransactionResponse = await integration.request('/api/budget/transactions', {
      method: 'POST',
      cookie: owner.cookie,
      json: {
        categoryId: ownerCategory.data.id,
        description: 'Train pass',
        amount: 55,
        date: '2026-03-08',
        merchant: 'NS',
      },
    });
    const ownerTransaction = (await ownerTransactionResponse.json()) as {
      data: {
        id: number;
        categoryId: number;
      };
    };

    const crossUserCategoryResponse = await integration.request(
      `/api/budget/categories/${ownerCategory.data.id}`,
      {
        cookie: intruder.cookie,
      },
    );
    expect(crossUserCategoryResponse.status).toBe(404);
    expect(await crossUserCategoryResponse.json()).toEqual({
      error: 'Category not found',
    });

    const crossUserCreateTransactionResponse = await integration.request(
      '/api/budget/transactions',
      {
        method: 'POST',
        cookie: intruder.cookie,
        json: {
          categoryId: ownerCategory.data.id,
          description: 'Unauthorized',
          amount: 10,
          date: '2026-03-08',
          merchant: 'Fail',
        },
      },
    );
    expect(crossUserCreateTransactionResponse.status).toBe(404);
    expect(await crossUserCreateTransactionResponse.json()).toEqual({
      error: 'Category not found',
    });

    const invalidCategoryIdResponse = await integration.request(
      `/api/budget/transactions/${ownerTransaction.data.id}`,
      {
        method: 'PATCH',
        cookie: owner.cookie,
        json: {
          categoryId: 0,
        },
      },
    );
    expect(invalidCategoryIdResponse.status).toBe(400);
    expect(await invalidCategoryIdResponse.json()).toEqual({
      error: 'Invalid category id',
    });

    const crossUserUpdateTransactionResponse = await integration.request(
      `/api/budget/transactions/${ownerTransaction.data.id}`,
      {
        method: 'PATCH',
        cookie: owner.cookie,
        json: {
          categoryId: intruderCategory.data.id,
        },
      },
    );
    expect(crossUserUpdateTransactionResponse.status).toBe(404);
    expect(await crossUserUpdateTransactionResponse.json()).toEqual({
      error: 'Category not found',
    });

    const ownerTransactionLookupResponse = await integration.request(
      `/api/budget/transactions/${ownerTransaction.data.id}`,
      {
        cookie: owner.cookie,
      },
    );
    expect(ownerTransactionLookupResponse.status).toBe(200);
    const ownerTransactionLookup = (await ownerTransactionLookupResponse.json()) as {
      data: {
        categoryId: number;
      };
    };
    expect(ownerTransactionLookup.data.categoryId).toBe(ownerCategory.data.id);
  });

  test('allows owners to update bank category mappings', async () => {
    const owner = await integration.signUp('budget-mapping-owner');
    const intruder = await integration.signUp('budget-mapping-intruder');

    const [mapping] = await db
      .insert(categoryMappings)
      .values({
        userId: owner.user.id,
        source: 'mcc',
        sourceKey: '5411',
        categoryName: 'Groceries',
      })
      .returning({ id: categoryMappings.id });

    const updateResponse = await integration.request(
      `/api/budget/category-mappings/${mapping.id}`,
      {
        method: 'PATCH',
        cookie: owner.cookie,
        json: {
          categoryName: 'Food',
        },
      },
    );
    expect(updateResponse.status).toBe(200);
    const updated = (await updateResponse.json()) as {
      data: {
        categoryName: string;
      };
    };
    expect(updated.data.categoryName).toBe('Food');

    const intruderResponse = await integration.request(
      `/api/budget/category-mappings/${mapping.id}`,
      {
        method: 'PATCH',
        cookie: intruder.cookie,
        json: {
          categoryName: 'Travel',
        },
      },
    );
    expect(intruderResponse.status).toBe(404);
    expect(await intruderResponse.json()).toEqual({
      error: 'Mapping not found',
    });
  });

  test('rejects invalid budget payloads', async () => {
    const owner = await integration.signUp('budget-validation');

    const invalidCategoryResponse = await integration.request('/api/budget/categories', {
      method: 'POST',
      cookie: owner.cookie,
      json: {
        name: 'Groceries',
        emoji: 'G',
        budgeted: 'oops',
        spent: 0,
        color: '#f59e0b',
        month: 'Mar',
        year: 2026,
      },
    });
    expect(invalidCategoryResponse.status).toBe(400);
    expect(await invalidCategoryResponse.json()).toEqual({
      error: 'Budgeted amount must be zero or greater',
    });

    const createCategoryResponse = await integration.request('/api/budget/categories', {
      method: 'POST',
      cookie: owner.cookie,
      json: {
        name: 'Household',
        emoji: 'H',
        budgeted: 320,
        spent: 10,
        color: '#0ea5e9',
        month: 'Mar',
        year: 2026,
      },
    });
    const category = (await createCategoryResponse.json()) as {
      data: {
        id: number;
      };
    };

    const invalidMonthResponse = await integration.request('/api/budget/categories', {
      method: 'POST',
      cookie: owner.cookie,
      json: {
        name: 'Travel',
        emoji: 'T',
        budgeted: 200,
        spent: 0,
        color: '#8b5cf6',
        month: 'March',
        year: 2026,
      },
    });
    expect(invalidMonthResponse.status).toBe(400);
    expect(await invalidMonthResponse.json()).toEqual({
      error: 'Invalid month',
    });

    const invalidTransactionDateResponse = await integration.request('/api/budget/transactions', {
      method: 'POST',
      cookie: owner.cookie,
      json: {
        categoryId: category.data.id,
        description: 'Market run',
        amount: 24,
        date: '2026-13-01',
        merchant: 'Weekend Market',
      },
    });
    expect(invalidTransactionDateResponse.status).toBe(400);
    expect(await invalidTransactionDateResponse.json()).toEqual({
      error: 'Transaction date must be a valid ISO date',
    });

    const unknownFieldPatchResponse = await integration.request(
      `/api/budget/categories/${category.data.id}`,
      {
        method: 'PATCH',
        cookie: owner.cookie,
        json: {
          cap: 500,
        },
      },
    );
    expect(unknownFieldPatchResponse.status).toBe(400);
    expect(await unknownFieldPatchResponse.json()).toEqual({
      error: 'Unknown field: cap',
    });
  });
});

describe('bunq integration', () => {
  test('returns not found for sync requests without a Bunq connection', async () => {
    const owner = await integration.signUp('bunq-no-connection');

    for (const path of ['/api/bunq/sync', '/api/bunq/sync/savings', '/api/bunq/sync/budget']) {
      const response = await integration.request(path, {
        method: 'POST',
        cookie: owner.cookie,
      });
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: 'No Bunq connection found' });
    }
  });
});

describe('goals integration', () => {
  test('returns a null emoji when a goal is created without one', async () => {
    const owner = await integration.signUp('goals-null-emoji');

    const createResponse = await integration.request('/api/goals', {
      method: 'POST',
      cookie: owner.cookie,
      json: {
        type: 'annual',
        name: 'Read more books',
        currentAmount: 0,
        targetAmount: 12,
        deadline: '2026-12-31',
        year: 2026,
        category: 'Personal',
        monthlyContribution: 0,
        currency: 'EUR',
      },
    });
    const created = (await createResponse.json()) as { data: { id: number; emoji: null } };
    expect(createResponse.status).toBe(201);
    expect(created.data.emoji).toBeNull();

    const listResponse = await integration.request('/api/goals', { cookie: owner.cookie });
    const listed = (await listResponse.json()) as { data: Array<{ id: number; emoji: null }> };
    expect(listResponse.status).toBe(200);
    expect(listed.data).toContainEqual(
      expect.objectContaining({ id: created.data.id, emoji: null }),
    );
  });

  test('covers goal CRUD', async () => {
    const owner = await integration.signUp('goals-owner');

    const createGoalResponse = await integration.request('/api/goals', {
      method: 'POST',
      cookie: owner.cookie,
      json: {
        type: 'savings',
        name: 'Emergency Fund',
        emoji: 'E',
        currentAmount: 1200,
        targetAmount: 10000,
        deadline: '2026-12',
        year: 2026,
        category: 'Safety Net',
        monthlyContribution: 300,
        monthlyTarget: 400,
        monthsCompleted: 3,
        totalMonths: 24,
        unit: null,
        color: '#2563eb',
        notes: 'Build six months of runway',
        currency: 'EUR',
      },
    });
    expect(createGoalResponse.status).toBe(201);
    const createdGoal = (await createGoalResponse.json()) as {
      data: {
        id: number;
        sourceType: string;
        sourceId: number | null;
        currentAmount: string;
        targetAmount: string;
      };
    };
    expect(createdGoal.data.sourceType).toBe('manual');
    expect(createdGoal.data.sourceId).toBeNull();
    expect(Number(createdGoal.data.currentAmount)).toBe(1200);
    expect(Number(createdGoal.data.targetAmount)).toBe(10000);

    const listGoalsResponse = await integration.request('/api/goals', {
      cookie: owner.cookie,
    });
    expect(listGoalsResponse.status).toBe(200);
    const listGoals = (await listGoalsResponse.json()) as {
      data: Array<{ id: number }>;
    };
    expect(listGoals.data.map((goal) => goal.id)).toEqual([createdGoal.data.id]);

    const goalLookupResponse = await integration.request(`/api/goals/${createdGoal.data.id}`, {
      cookie: owner.cookie,
    });
    expect(goalLookupResponse.status).toBe(200);

    const updateGoalResponse = await integration.request(`/api/goals/${createdGoal.data.id}`, {
      method: 'PATCH',
      cookie: owner.cookie,
      json: {
        currentAmount: 2000,
        monthlyContribution: 350,
        notes: 'Increased monthly saving rate',
      },
    });
    expect(updateGoalResponse.status).toBe(200);
    const updatedGoal = (await updateGoalResponse.json()) as {
      data: {
        currentAmount: string;
        monthlyContribution: string;
        notes: string | null;
      };
    };
    expect(Number(updatedGoal.data.currentAmount)).toBe(2000);
    expect(Number(updatedGoal.data.monthlyContribution)).toBe(350);
    expect(updatedGoal.data.notes).toBe('Increased monthly saving rate');

    const deleteGoalResponse = await integration.request(`/api/goals/${createdGoal.data.id}`, {
      method: 'DELETE',
      cookie: owner.cookie,
    });
    expect(deleteGoalResponse.status).toBe(200);

    const deletedGoalLookupResponse = await integration.request(
      `/api/goals/${createdGoal.data.id}`,
      {
        cookie: owner.cookie,
      },
    );
    expect(deletedGoalLookupResponse.status).toBe(404);
    expect(await deletedGoalLookupResponse.json()).toEqual({
      error: 'Goal not found',
    });
  });

  test('persists and validates linked goal sources', async () => {
    const owner = await integration.signUp('goals-source-owner');
    const intruder = await integration.signUp('goals-source-intruder');

    const createOwnerAccountResponse = await integration.request('/api/savings/accounts', {
      method: 'POST',
      cookie: owner.cookie,
      json: {
        name: 'Emergency Fund',
        bank: 'Monzo',
        balance: 2500,
        currency: 'EUR',
        interestRate: 2,
        accountType: 'Easy Access',
        color: '#2563eb',
        emoji: 'E',
      },
    });
    expect(createOwnerAccountResponse.status).toBe(201);
    const ownerAccount = (await createOwnerAccountResponse.json()) as {
      data: {
        id: number;
      };
    };

    const createIntruderAccountResponse = await integration.request('/api/savings/accounts', {
      method: 'POST',
      cookie: intruder.cookie,
      json: {
        name: 'Private Pot',
        bank: 'Starling',
        balance: 9999,
        currency: 'EUR',
        interestRate: 1.5,
        accountType: 'Easy Access',
        color: '#dc2626',
        emoji: 'P',
      },
    });
    expect(createIntruderAccountResponse.status).toBe(201);
    const intruderAccount = (await createIntruderAccountResponse.json()) as {
      data: {
        id: number;
      };
    };

    const createLinkedGoalResponse = await integration.request('/api/goals', {
      method: 'POST',
      cookie: owner.cookie,
      json: {
        type: 'savings',
        sourceType: 'savings_account',
        sourceId: ownerAccount.data.id,
        name: 'Emergency Fund',
        emoji: 'E',
        currentAmount: 0,
        targetAmount: 10000,
        deadline: '2026-12',
        year: 2026,
        category: 'Savings',
        monthlyContribution: 300,
        monthlyTarget: null,
        monthsCompleted: null,
        totalMonths: null,
        unit: null,
        color: '#2563eb',
        notes: '',
        currency: 'EUR',
      },
    });
    expect(createLinkedGoalResponse.status).toBe(201);
    const linkedGoal = (await createLinkedGoalResponse.json()) as {
      data: {
        id: number;
        sourceType: string;
        sourceId: number | null;
      };
    };
    expect(linkedGoal.data.sourceType).toBe('savings_account');
    expect(linkedGoal.data.sourceId).toBe(ownerAccount.data.id);

    const createSalaryGoalResponse = await integration.request('/api/goals', {
      method: 'POST',
      cookie: owner.cookie,
      json: {
        type: 'salary',
        name: 'Promotion',
        emoji: 'S',
        currentAmount: 0,
        targetAmount: 90000,
        deadline: '2026-12',
        year: 2026,
        category: 'Career',
        monthlyContribution: 0,
        monthlyTarget: null,
        monthsCompleted: null,
        totalMonths: null,
        unit: null,
        color: '#16a34a',
        notes: '',
        currency: 'EUR',
      },
    });
    expect(createSalaryGoalResponse.status).toBe(201);
    const salaryGoal = (await createSalaryGoalResponse.json()) as {
      data: {
        sourceType: string;
        sourceId: number | null;
      };
    };
    expect(salaryGoal.data.sourceType).toBe('salary_latest_gross');
    expect(salaryGoal.data.sourceId).toBeNull();

    const crossUserSourceCreateResponse = await integration.request('/api/goals', {
      method: 'POST',
      cookie: owner.cookie,
      json: {
        type: 'savings',
        sourceType: 'savings_account',
        sourceId: intruderAccount.data.id,
        name: 'Wrong Pot',
        currentAmount: 0,
        targetAmount: 5000,
        deadline: '2026-12',
        year: 2026,
        category: 'Savings',
        monthlyContribution: 100,
        currency: 'EUR',
      },
    });
    expect(crossUserSourceCreateResponse.status).toBe(400);
    expect(await crossUserSourceCreateResponse.json()).toEqual({
      error: 'Savings account source not found',
    });

    const crossUserSourcePatchResponse = await integration.request(
      `/api/goals/${linkedGoal.data.id}`,
      {
        method: 'PATCH',
        cookie: owner.cookie,
        json: {
          sourceId: intruderAccount.data.id,
        },
      },
    );
    expect(crossUserSourcePatchResponse.status).toBe(400);
    expect(await crossUserSourcePatchResponse.json()).toEqual({
      error: 'Savings account source not found',
    });
  });

  test('allows unlinking and relinking goal sources', async () => {
    const owner = await integration.signUp('goals-relink-owner');

    const createAccountResponse = await integration.request('/api/savings/accounts', {
      method: 'POST',
      cookie: owner.cookie,
      json: {
        name: 'Vacation Fund',
        bank: 'Wise',
        balance: 3200,
        currency: 'USD',
        interestRate: 0.5,
        accountType: 'Easy Access',
        color: '#3b82f6',
        emoji: 'V',
      },
    });
    expect(createAccountResponse.status).toBe(201);
    const account = (await createAccountResponse.json()) as {
      data: { id: number };
    };

    const createGoalResponse = await integration.request('/api/goals', {
      method: 'POST',
      cookie: owner.cookie,
      json: {
        type: 'savings',
        sourceType: 'savings_account',
        sourceId: account.data.id,
        name: 'Vacation 2026',
        emoji: 'V',
        currentAmount: 0,
        targetAmount: 5000,
        deadline: '2026-12',
        year: 2026,
        category: 'Travel',
        monthlyContribution: 400,
        currency: 'USD',
      },
    });
    expect(createGoalResponse.status).toBe(201);
    const linkedGoal = (await createGoalResponse.json()) as {
      data: {
        id: number;
        sourceType: string;
        sourceId: number | null;
      };
    };
    expect(linkedGoal.data.sourceType).toBe('savings_account');
    expect(linkedGoal.data.sourceId).toBe(account.data.id);

    const unlinkResponse = await integration.request(`/api/goals/${linkedGoal.data.id}`, {
      method: 'PATCH',
      cookie: owner.cookie,
      json: {
        sourceType: 'manual',
      },
    });
    expect(unlinkResponse.status).toBe(200);
    const unlinkedGoal = (await unlinkResponse.json()) as {
      data: {
        sourceType: string;
        sourceId: number | null;
      };
    };
    expect(unlinkedGoal.data.sourceType).toBe('manual');
    expect(unlinkedGoal.data.sourceId).toBeNull();

    const relinkResponse = await integration.request(`/api/goals/${linkedGoal.data.id}`, {
      method: 'PATCH',
      cookie: owner.cookie,
      json: {
        sourceType: 'savings_account',
        sourceId: account.data.id,
      },
    });
    expect(relinkResponse.status).toBe(200);
    const relinkedGoal = (await relinkResponse.json()) as {
      data: {
        sourceType: string;
        sourceId: number | null;
      };
    };
    expect(relinkedGoal.data.sourceType).toBe('savings_account');
    expect(relinkedGoal.data.sourceId).toBe(account.data.id);
  });

  test('enforces goal ownership boundaries', async () => {
    const owner = await integration.signUp('goals-cross-owner');
    const intruder = await integration.signUp('goals-cross-intruder');

    const createGoalResponse = await integration.request('/api/goals', {
      method: 'POST',
      cookie: owner.cookie,
      json: {
        type: 'annual',
        name: 'Books Read',
        emoji: 'B',
        currentAmount: 4,
        targetAmount: 12,
        deadline: '2026-12',
        year: 2026,
        category: 'Learning',
        monthlyContribution: 1,
        monthlyTarget: 1,
        monthsCompleted: 4,
        totalMonths: 12,
        unit: 'books',
        color: '#16a34a',
        notes: 'Read one book per month',
        currency: 'EUR',
      },
    });
    const createdGoal = (await createGoalResponse.json()) as {
      data: {
        id: number;
      };
    };

    const crossUserLookupResponse = await integration.request(`/api/goals/${createdGoal.data.id}`, {
      cookie: intruder.cookie,
    });
    expect(crossUserLookupResponse.status).toBe(404);
    expect(await crossUserLookupResponse.json()).toEqual({
      error: 'Goal not found',
    });

    const crossUserPatchResponse = await integration.request(`/api/goals/${createdGoal.data.id}`, {
      method: 'PATCH',
      cookie: intruder.cookie,
      json: {
        currentAmount: 10,
      },
    });
    expect(crossUserPatchResponse.status).toBe(404);
    expect(await crossUserPatchResponse.json()).toEqual({
      error: 'Goal not found',
    });

    const crossUserDeleteResponse = await integration.request(`/api/goals/${createdGoal.data.id}`, {
      method: 'DELETE',
      cookie: intruder.cookie,
    });
    expect(crossUserDeleteResponse.status).toBe(404);
    expect(await crossUserDeleteResponse.json()).toEqual({
      error: 'Goal not found',
    });
  });

  test('rejects invalid goal payloads', async () => {
    const owner = await integration.signUp('goals-validation');

    const invalidTypeResponse = await integration.request('/api/goals', {
      method: 'POST',
      cookie: owner.cookie,
      json: {
        type: 'side_quest',
        name: 'Emergency Fund',
        currentAmount: 500,
        targetAmount: 5000,
        deadline: '2026-12',
        year: 2026,
        category: 'Savings',
        monthlyContribution: 200,
        currency: 'EUR',
      },
    });
    expect(invalidTypeResponse.status).toBe(400);
    expect(await invalidTypeResponse.json()).toEqual({
      error: 'Invalid goal type',
    });

    const missingNameResponse = await integration.request('/api/goals', {
      method: 'POST',
      cookie: owner.cookie,
      json: {
        type: 'savings',
        name: '   ',
        currentAmount: 500,
        targetAmount: 5000,
        deadline: '2026-12',
        year: 2026,
        category: 'Savings',
        monthlyContribution: 200,
        currency: 'EUR',
      },
    });
    expect(missingNameResponse.status).toBe(400);
    expect(await missingNameResponse.json()).toEqual({
      error: 'Goal name is required',
    });

    const invalidInvestHabitResponse = await integration.request('/api/goals', {
      method: 'POST',
      cookie: owner.cookie,
      json: {
        type: 'invest_habit',
        name: 'Monthly ETF Habit',
        currentAmount: 0,
        targetAmount: 0,
        deadline: '2026-12',
        year: 2026,
        category: 'Investing',
        monthlyContribution: 0,
        monthlyTarget: 0,
        totalMonths: 12,
        currency: 'EUR',
      },
    });
    expect(invalidInvestHabitResponse.status).toBe(400);
    expect(await invalidInvestHabitResponse.json()).toEqual({
      error: 'Monthly target must be greater than zero',
    });

    const createGoalResponse = await integration.request('/api/goals', {
      method: 'POST',
      cookie: owner.cookie,
      json: {
        type: 'annual',
        name: 'Books',
        emoji: 'B',
        currentAmount: 2,
        targetAmount: 12,
        deadline: '2026-12',
        year: 2026,
        category: 'Learning',
        monthlyContribution: 0,
        monthlyTarget: null,
        monthsCompleted: 2,
        totalMonths: 12,
        unit: 'books',
        color: '#16a34a',
        notes: '',
        currency: 'EUR',
      },
    });
    const goal = (await createGoalResponse.json()) as {
      data: {
        id: number;
      };
    };

    const unknownFieldPatchResponse = await integration.request(`/api/goals/${goal.data.id}`, {
      method: 'PATCH',
      cookie: owner.cookie,
      json: {
        progress: 90,
      },
    });
    expect(unknownFieldPatchResponse.status).toBe(400);
    expect(await unknownFieldPatchResponse.json()).toEqual({
      error: 'Unknown field: progress',
    });
  });

  test('creates and validates auto-linked goal source types', async () => {
    const owner = await integration.signUp('goals-auto-source');

    const createPortfolioGoal = await integration.request('/api/goals', {
      method: 'POST',
      cookie: owner.cookie,
      json: {
        type: 'portfolio',
        name: 'Portfolio 100k',
        emoji: 'P',
        currentAmount: 0,
        targetAmount: 100000,
        deadline: '2027-12',
        year: 2027,
        category: 'Investing',
        monthlyContribution: 0,
        currency: 'EUR',
      },
    });
    expect(createPortfolioGoal.status).toBe(201);
    const portfolioGoal = (await createPortfolioGoal.json()) as {
      data: { sourceType: string; sourceId: number | null };
    };
    expect(portfolioGoal.data.sourceType).toBe('portfolio_total');
    expect(portfolioGoal.data.sourceId).toBeNull();

    const createNetWorthGoal = await integration.request('/api/goals', {
      method: 'POST',
      cookie: owner.cookie,
      json: {
        type: 'net_worth',
        name: 'Net Worth 500k',
        emoji: 'N',
        currentAmount: 0,
        targetAmount: 500000,
        deadline: '2030-12',
        year: 2030,
        category: 'Net Worth',
        monthlyContribution: 0,
        currency: 'EUR',
      },
    });
    expect(createNetWorthGoal.status).toBe(201);
    const netWorthGoal = (await createNetWorthGoal.json()) as {
      data: { sourceType: string; sourceId: number | null };
    };
    expect(netWorthGoal.data.sourceType).toBe('net_worth_total');
    expect(netWorthGoal.data.sourceId).toBeNull();

    const createInvestHabitGoal = await integration.request('/api/goals', {
      method: 'POST',
      cookie: owner.cookie,
      json: {
        type: 'invest_habit',
        name: 'Monthly Buys',
        emoji: 'I',
        currentAmount: 0,
        targetAmount: 0,
        deadline: '2026-12',
        year: 2026,
        category: 'Investing',
        monthlyContribution: 0,
        monthlyTarget: 500,
        monthsCompleted: 0,
        totalMonths: 12,
        currency: 'EUR',
      },
    });
    expect(createInvestHabitGoal.status).toBe(201);
    const investHabitGoal = (await createInvestHabitGoal.json()) as {
      data: { sourceType: string; sourceId: number | null };
    };
    expect(investHabitGoal.data.sourceType).toBe('invest_habit_buys');
    expect(investHabitGoal.data.sourceId).toBeNull();

    const wrongSourceForPortfolio = await integration.request('/api/goals', {
      method: 'POST',
      cookie: owner.cookie,
      json: {
        type: 'portfolio',
        sourceType: 'manual',
        name: 'Should Fail',
        emoji: 'X',
        currentAmount: 0,
        targetAmount: 50000,
        deadline: '2027-12',
        year: 2027,
        category: 'Investing',
        monthlyContribution: 0,
        currency: 'EUR',
      },
    });
    expect(wrongSourceForPortfolio.status).toBe(400);
    expect(await wrongSourceForPortfolio.json()).toEqual({
      error: 'Portfolio goals must use the portfolio total source',
    });

    const wrongSourceForNetWorth = await integration.request('/api/goals', {
      method: 'POST',
      cookie: owner.cookie,
      json: {
        type: 'net_worth',
        sourceType: 'manual',
        name: 'Should Fail',
        emoji: 'X',
        currentAmount: 0,
        targetAmount: 100000,
        deadline: '2027-12',
        year: 2027,
        category: 'Net Worth',
        monthlyContribution: 0,
        currency: 'EUR',
      },
    });
    expect(wrongSourceForNetWorth.status).toBe(400);
    expect(await wrongSourceForNetWorth.json()).toEqual({
      error: 'Net worth goals must use the net worth total source',
    });

    const wrongSourceForInvestHabit = await integration.request('/api/goals', {
      method: 'POST',
      cookie: owner.cookie,
      json: {
        type: 'invest_habit',
        sourceType: 'manual',
        name: 'Should Fail',
        emoji: 'X',
        currentAmount: 0,
        targetAmount: 0,
        deadline: '2026-12',
        year: 2026,
        category: 'Investing',
        monthlyContribution: 0,
        monthlyTarget: 500,
        totalMonths: 12,
        currency: 'EUR',
      },
    });
    expect(wrongSourceForInvestHabit.status).toBe(400);
    expect(await wrongSourceForInvestHabit.json()).toEqual({
      error: 'Invest habit goals must use the invest habit buys source',
    });

    const sourceIdOnPortfolio = await integration.request('/api/goals', {
      method: 'POST',
      cookie: owner.cookie,
      json: {
        type: 'portfolio',
        sourceType: 'portfolio_total',
        sourceId: 42,
        name: 'Should Fail',
        emoji: 'X',
        currentAmount: 0,
        targetAmount: 50000,
        deadline: '2027-12',
        year: 2027,
        category: 'Investing',
        monthlyContribution: 0,
        currency: 'EUR',
      },
    });
    expect(sourceIdOnPortfolio.status).toBe(400);
    expect(await sourceIdOnPortfolio.json()).toEqual({
      error: 'Portfolio total goals cannot include a source id',
    });
  });
});
