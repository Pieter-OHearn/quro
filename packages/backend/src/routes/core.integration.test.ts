import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { createIntegrationHelpers, integrationPassword } from '../test/integration';

const integration = createIntegrationHelpers('ticket6.integration.quro.test');

beforeAll(async () => {
  await integration.cleanup();
});

afterAll(async () => {
  await integration.cleanup();
});

describe('auth integration', () => {
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

describe('goals integration', () => {
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
        currentAmount: string;
        targetAmount: string;
      };
    };
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
});
