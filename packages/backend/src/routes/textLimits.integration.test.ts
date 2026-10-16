import { afterAll, beforeAll, describe, expect, test, setDefaultTimeout } from 'bun:test';
import { eq } from 'drizzle-orm';
import { TEXT_FIELD_LIMITS, TEXT_LIMITS } from '@quro/shared';
import { db } from '../db/client';
import {
  budgetTransactions,
  categoryMappings,
  debts,
  goals,
  pensionPots,
  properties,
  savingsAccounts,
  users,
} from '../db/schema';
import { createIntegrationHelpers, type AuthSession } from '../test/integration';

// Free-text request fields are bounded by TEXT_FIELD_LIMITS: a value at the limit is stored, one
// character more is refused with a 400 that names the field. A row that predates the limits can
// still be edited as long as the request leaves its long field unchanged.

setDefaultTimeout(60_000);

const integration = createIntegrationHelpers('text-limits.integration.quro.test');
const DATE = '2026-03-02';
const BAD_REQUEST = 400;
const CREATED = 201;
const OK = 200;

let owner: AuthSession;

beforeAll(async () => {
  await integration.cleanup();
  owner = await integration.signUp('owner');
});
afterAll(() => integration.cleanup());

function send(method: string, path: string, json?: unknown) {
  return integration.request(path, { method, cookie: owner.cookie, json });
}

async function createdId(path: string, json: unknown): Promise<number> {
  const response = await send('POST', path, json);
  if (response.status !== CREATED) {
    throw new Error(`POST ${path}: ${response.status} ${await response.text()}`);
  }
  return ((await response.json()) as { data: { id: number } }).data.id;
}

const text = (length: number) => 'x'.repeat(length);
const errorOf = async (response: Response) => ((await response.json()) as { error: string }).error;
const lengthError = (field: string, limit: number) =>
  `${field} must be at most ${limit} characters`;

type Family = {
  label: string;
  limits: Readonly<Record<string, number>>;
  /** Fields whose value must keep a format, so the limit is checked by message, not by status. */
  formatted?: ReadonlyArray<string>;
  /** Sends one create request with the overrides applied to a valid payload. */
  create: (overrides: Record<string, unknown>) => Response | Promise<Response>;
};

const state: Record<string, number> = {};

const families: Family[] = [
  {
    label: 'budget categories',
    limits: TEXT_FIELD_LIMITS.budgetCategory,
    create: (o) =>
      send('POST', '/api/budget/categories', {
        name: `Category ${(state.sequence = (state.sequence ?? 0) + 1)}`,
        emoji: 'G',
        budgeted: 100,
        spent: 0,
        color: '#111827',
        month: 'Mar',
        year: 2026,
        ...o,
      }),
  },
  {
    label: 'budget transactions',
    limits: TEXT_FIELD_LIMITS.budgetTransaction,
    create: (o) =>
      send('POST', '/api/budget/transactions', {
        categoryId: state.budgetCategory,
        description: 'Shop',
        amount: 5,
        date: DATE,
        merchant: 'Corner shop',
        ...o,
      }),
  },
  {
    label: 'debts',
    limits: TEXT_FIELD_LIMITS.debt,
    create: (o) =>
      send('POST', '/api/debts', {
        name: 'Loan',
        type: 'personal_loan',
        lender: 'Synthetic Lender',
        originalAmount: 1000,
        remainingBalance: 1000,
        currency: 'EUR',
        interestRate: 5,
        monthlyPayment: 100,
        startDate: '2026-01-01',
        color: '#ef4444',
        emoji: 'D',
        ...o,
      }),
  },
  {
    label: 'debt payments',
    limits: TEXT_FIELD_LIMITS.debtPayment,
    create: (o) =>
      send('POST', '/api/debts/payments', {
        debtId: state.debt,
        amount: 10,
        interest: 1,
        date: DATE,
        ...o,
      }),
  },
  {
    label: 'employments',
    limits: TEXT_FIELD_LIMITS.employment,
    create: (o) =>
      send('POST', '/api/employments', {
        employerName: 'Synthetic Employer',
        employmentType: 'employed',
        serviceStartDate: '2020-01-01',
        endDate: null,
        noticePeriodMonths: 1,
        ...o,
      }),
  },
  {
    label: 'goals',
    limits: TEXT_FIELD_LIMITS.goal,
    formatted: ['startMonth'],
    create: (o) =>
      send('POST', '/api/goals', {
        type: 'savings',
        name: 'Holiday',
        emoji: 'H',
        currentAmount: 0,
        targetAmount: 1000,
        deadline: 'Dec 2027',
        category: 'Travel',
        monthlyContribution: 50,
        currency: 'EUR',
        ...o,
      }),
  },
  {
    label: 'holdings',
    limits: TEXT_FIELD_LIMITS.holding,
    create: (o) =>
      send('POST', '/api/investments/holdings', {
        name: 'Synthetic fund',
        ticker: 'SYN',
        currentPrice: 10,
        currency: 'EUR',
        sector: 'Other',
        itemType: 'equity',
        ...o,
      }),
  },
  {
    label: 'holding transactions',
    limits: TEXT_FIELD_LIMITS.holdingTransaction,
    create: (o) =>
      send('POST', '/api/investments/holding-transactions', {
        holdingId: state.holding,
        type: 'buy',
        shares: 1,
        price: 10,
        date: DATE,
        ...o,
      }),
  },
  {
    label: 'properties',
    limits: TEXT_FIELD_LIMITS.property,
    create: (o) =>
      send('POST', '/api/investments/properties', {
        address: '1 Synthetic Lane',
        propertyType: 'primary_home',
        purchasePrice: 400000,
        currentValue: 450000,
        monthlyRent: 0,
        currency: 'EUR',
        emoji: 'R',
        ...o,
      }),
  },
  {
    label: 'property transactions',
    limits: TEXT_FIELD_LIMITS.propertyTransaction,
    create: (o) =>
      send('POST', '/api/investments/property-transactions', {
        propertyId: state.mortgageProperty,
        type: 'repayment',
        amount: 100,
        principal: 80,
        interest: 20,
        date: DATE,
        ...o,
      }),
  },
  {
    label: 'mortgages',
    limits: TEXT_FIELD_LIMITS.mortgage,
    formatted: ['fixedUntil', 'startDate', 'endDate'],
    create: async (o) =>
      send('POST', '/api/mortgages', {
        linkedPropertyId: await createdId('/api/investments/properties', {
          address: 'Mortgage lane',
          propertyType: 'primary_home',
          purchasePrice: 400000,
          currentValue: 450000,
          monthlyRent: 0,
          currency: 'EUR',
        }),
        lender: 'Synthetic Lender',
        originalAmount: 350000,
        outstandingBalance: 300000,
        propertyValue: 450000,
        monthlyPayment: 1500,
        interestRate: 2.4,
        rateType: 'fixed',
        repaymentType: 'linear',
        fixedUntil: '2031-06-30',
        termYears: 30,
        startDate: '2021-07-01',
        endDate: '2051-07-01',
        overpaymentLimit: 10,
        ...o,
      }),
  },
  {
    label: 'mortgage transactions',
    limits: TEXT_FIELD_LIMITS.mortgageTransaction,
    create: (o) =>
      send('POST', '/api/mortgages/transactions', {
        mortgageId: state.mortgage,
        type: 'repayment',
        amount: 1200,
        principal: 1000,
        interest: 200,
        date: DATE,
        ...o,
      }),
  },
  {
    label: 'pension pots',
    limits: TEXT_FIELD_LIMITS.pensionPot,
    create: (o) =>
      send('POST', '/api/pensions/pots', {
        name: 'Pot',
        provider: 'Synthetic Provider',
        type: 'Personal Pension',
        balance: 100,
        currency: 'EUR',
        employeeMonthly: 0,
        employerMonthly: 0,
        ...o,
      }),
  },
  {
    label: 'pension transactions',
    limits: TEXT_FIELD_LIMITS.pensionTransaction,
    create: (o) =>
      send('POST', '/api/pensions/transactions', {
        potId: state.pensionPot,
        type: 'fee',
        amount: 5,
        date: DATE,
        ...o,
      }),
  },
  {
    label: 'payslips',
    limits: TEXT_FIELD_LIMITS.payslip,
    create: (o) =>
      send('POST', '/api/salary/payslips', {
        month: 'March 2026',
        date: '2026-03-31',
        gross: 5000,
        tax: 1000,
        pension: 200,
        net: 3800,
        currency: 'EUR',
        ...o,
      }),
  },
  {
    label: 'savings accounts',
    limits: TEXT_FIELD_LIMITS.savingsAccount,
    create: (o) =>
      send('POST', '/api/savings/accounts', {
        name: 'Rainy day',
        bank: 'Synthetic Bank',
        balance: 0,
        currency: 'EUR',
        interestRate: 1,
        accountType: 'Easy Access',
        color: '#0ea5e9',
        emoji: 'S',
        ...o,
      }),
  },
  {
    label: 'savings transactions',
    limits: TEXT_FIELD_LIMITS.savingsTransaction,
    create: (o) =>
      send('POST', '/api/savings/transactions', {
        accountId: state.savingsAccount,
        type: 'deposit',
        amount: 10,
        date: DATE,
        ...o,
      }),
  },
];

describe('create requests', () => {
  beforeAll(async () => {
    state.budgetCategory = await createdId('/api/budget/categories', {
      name: 'Parent',
      emoji: 'P',
      budgeted: 100,
      spent: 0,
      color: '#111827',
      month: 'Mar',
      year: 2026,
    });
    state.debt = await createdId('/api/debts', {
      name: 'Parent loan',
      type: 'personal_loan',
      lender: 'Synthetic Lender',
      originalAmount: 100000,
      remainingBalance: 100000,
      currency: 'EUR',
      interestRate: 5,
      monthlyPayment: 100,
      startDate: '2026-01-01',
      color: '#ef4444',
      emoji: 'D',
    });
    state.holding = await createdId('/api/investments/holdings', {
      name: 'Parent fund',
      ticker: 'PAR',
      currentPrice: 10,
      currency: 'EUR',
      sector: 'Other',
      itemType: 'equity',
    });
    state.property = await createdId('/api/investments/properties', {
      address: 'Parent lane',
      propertyType: 'primary_home',
      purchasePrice: 400000,
      currentValue: 450000,
      monthlyRent: 0,
      currency: 'EUR',
    });
    state.mortgageProperty = await createdId('/api/investments/properties', {
      address: 'Parent mortgage lane',
      propertyType: 'primary_home',
      purchasePrice: 400000,
      currentValue: 450000,
      monthlyRent: 0,
      currency: 'EUR',
    });
    state.mortgage = await createdId('/api/mortgages', {
      linkedPropertyId: state.mortgageProperty,
      lender: 'Synthetic Lender',
      originalAmount: 350000,
      outstandingBalance: 300000,
      propertyValue: 450000,
      monthlyPayment: 1500,
      interestRate: 2.4,
      rateType: 'fixed',
      repaymentType: 'linear',
      fixedUntil: '2031-06-30',
      termYears: 30,
      startDate: '2021-07-01',
      endDate: '2051-07-01',
      overpaymentLimit: 10,
    });
    state.pensionPot = await createdId('/api/pensions/pots', {
      name: 'Parent pot',
      provider: 'Synthetic Provider',
      type: 'Personal Pension',
      balance: 100,
      currency: 'EUR',
      employeeMonthly: 0,
      employerMonthly: 0,
    });
    state.savingsAccount = await createdId('/api/savings/accounts', {
      name: 'Parent savings',
      bank: 'Synthetic Bank',
      balance: 100,
      currency: 'EUR',
      interestRate: 1,
      accountType: 'Easy Access',
      color: '#0ea5e9',
      emoji: 'S',
    });
  });

  for (const family of families) {
    describe(family.label, () => {
      for (const [field, limit] of Object.entries(family.limits)) {
        test(`${field}: ${limit} characters accepted, ${limit + 1} refused`, async () => {
          const formatted = family.formatted?.includes(field) ?? false;
          const atLimit = await family.create({ [field]: text(limit) });
          if (formatted) {
            const body = atLimit.status === CREATED ? '' : await errorOf(atLimit);
            expect(body).not.toBe(lengthError(field, limit));
          } else {
            if (atLimit.status !== CREATED) throw new Error(await atLimit.clone().text());
            expect(atLimit.status).toBe(CREATED);
          }

          const over = await family.create({ [field]: text(limit + 1) });
          expect(over.status).toBe(BAD_REQUEST);
          expect(await errorOf(over)).toBe(lengthError(field, limit));
        });
      }
    });
  }

  test('surrounding whitespace is not counted', async () => {
    const response = await families[0]!.create({
      name: ` ${text(TEXT_LIMITS.name)} `,
      month: 'Apr',
    });
    expect(response.status).toBe(CREATED);
  });
});

describe('edits to rows that predate the limits', () => {
  const longName = text(TEXT_LIMITS.name + 40);
  const longNote = text(TEXT_LIMITS.longNote + 500);

  test('a debt keeps its long notes through an edit that leaves them alone', async () => {
    const id = await createdId('/api/debts', {
      name: 'Old loan',
      type: 'personal_loan',
      lender: 'Synthetic Lender',
      originalAmount: 1000,
      remainingBalance: 1000,
      currency: 'EUR',
      interestRate: 5,
      monthlyPayment: 100,
      startDate: '2026-01-01',
      color: '#ef4444',
      emoji: 'D',
    });
    await db.update(debts).set({ notes: longNote, name: longName }).where(eq(debts.id, id));

    const unrelated = await send('PATCH', `/api/debts/${id}`, { monthlyPayment: 150 });
    expect(unrelated.status).toBe(OK);
    const resent = await send('PATCH', `/api/debts/${id}`, {
      name: longName,
      notes: longNote,
      monthlyPayment: 160,
    });
    expect(resent.status).toBe(OK);
    const [row] = await db.select().from(debts).where(eq(debts.id, id));
    expect(row!.notes).toBe(longNote);
    expect(row!.name).toBe(longName);

    const changed = await send('PATCH', `/api/debts/${id}`, { notes: `${longNote}!` });
    expect(changed.status).toBe(BAD_REQUEST);
    expect(await errorOf(changed)).toBe(lengthError('notes', TEXT_LIMITS.longNote));
    const shortened = await send('PATCH', `/api/debts/${id}`, { notes: 'short' });
    expect(shortened.status).toBe(OK);
  });

  test('a budget transaction, goal, savings account, pension pot and property do the same', async () => {
    const categoryId = await createdId('/api/budget/categories', {
      name: 'Old category',
      emoji: 'O',
      budgeted: 100,
      spent: 0,
      color: '#111827',
      month: 'May',
      year: 2026,
    });
    const transactionId = await createdId('/api/budget/transactions', {
      categoryId,
      description: 'Old',
      amount: 5,
      date: DATE,
      merchant: 'Old shop',
    });
    await db
      .update(budgetTransactions)
      .set({ description: text(TEXT_LIMITS.description + 10) })
      .where(eq(budgetTransactions.id, transactionId));
    const budgetPath = `/api/budget/transactions/${transactionId}`;
    expect((await send('PATCH', budgetPath, { amount: 6 })).status).toBe(OK);
    expect(
      (await send('PATCH', budgetPath, { description: text(TEXT_LIMITS.description + 10) })).status,
    ).toBe(OK);
    const refused = await send('PATCH', budgetPath, {
      description: text(TEXT_LIMITS.description + 11),
    });
    expect(refused.status).toBe(BAD_REQUEST);
    expect(await errorOf(refused)).toBe(lengthError('description', TEXT_LIMITS.description));

    const goalId = await createdId('/api/goals', {
      type: 'savings',
      name: 'Old goal',
      currentAmount: 0,
      targetAmount: 1000,
      deadline: 'Dec 2027',
      category: 'Travel',
      monthlyContribution: 50,
      currency: 'EUR',
    });
    await db.update(goals).set({ notes: longNote }).where(eq(goals.id, goalId));
    expect((await send('PATCH', `/api/goals/${goalId}`, { targetAmount: 2000 })).status).toBe(OK);
    expect((await send('PATCH', `/api/goals/${goalId}`, { notes: longNote })).status).toBe(OK);
    expect((await send('PATCH', `/api/goals/${goalId}`, { notes: `${longNote}!` })).status).toBe(
      BAD_REQUEST,
    );

    const accountId = await createdId('/api/savings/accounts', {
      name: 'Old account',
      bank: 'Synthetic Bank',
      balance: 0,
      currency: 'EUR',
      interestRate: 1,
      accountType: 'Easy Access',
      color: '#0ea5e9',
      emoji: 'S',
    });
    await db
      .update(savingsAccounts)
      .set({ name: longName })
      .where(eq(savingsAccounts.id, accountId));
    const accountPath = `/api/savings/accounts/${accountId}`;
    expect((await send('PATCH', accountPath, { interestRate: 2 })).status).toBe(OK);
    expect((await send('PATCH', accountPath, { name: longName })).status).toBe(OK);
    expect((await send('PATCH', accountPath, { name: `${longName}!` })).status).toBe(BAD_REQUEST);

    const potId = await createdId('/api/pensions/pots', {
      name: 'Old pot',
      provider: 'Synthetic Provider',
      type: 'Personal Pension',
      balance: 100,
      currency: 'EUR',
      employeeMonthly: 0,
      employerMonthly: 0,
    });
    await db.update(pensionPots).set({ notes: longNote }).where(eq(pensionPots.id, potId));
    const potPath = `/api/pensions/pots/${potId}`;
    expect((await send('PATCH', potPath, { notes: longNote, balance: 200 })).status).toBe(OK);
    expect((await send('PATCH', potPath, { notes: `${longNote}!` })).status).toBe(BAD_REQUEST);

    const propertyId = await createdId('/api/investments/properties', {
      address: 'Old lane',
      propertyType: 'primary_home',
      purchasePrice: 400000,
      currentValue: 450000,
      monthlyRent: 0,
      currency: 'EUR',
    });
    await db
      .update(properties)
      .set({ address: text(TEXT_LIMITS.address + 50) })
      .where(eq(properties.id, propertyId));
    const propertyPath = `/api/investments/properties/${propertyId}`;
    expect((await send('PATCH', propertyPath, { monthlyRent: 10 })).status).toBe(OK);
    expect(
      (await send('PATCH', propertyPath, { address: text(TEXT_LIMITS.address + 50) })).status,
    ).toBe(OK);
    expect(
      (await send('PATCH', propertyPath, { address: text(TEXT_LIMITS.address + 51) })).status,
    ).toBe(BAD_REQUEST);
  });

  test('a category mapping edit is bounded and an unchanged long name is accepted', async () => {
    const [mapping] = await db
      .insert(categoryMappings)
      .values({
        userId: owner.user.id,
        source: 'synthetic',
        sourceKey: 'key-1',
        categoryName: longName,
      })
      .returning();
    const path = `/api/budget/category-mappings/${mapping!.id}`;
    expect((await send('PATCH', path, { categoryName: longName })).status).toBe(OK);
    expect((await send('PATCH', path, { categoryName: text(TEXT_LIMITS.name) })).status).toBe(OK);
    const refused = await send('PATCH', path, { categoryName: text(TEXT_LIMITS.name + 1) });
    expect(refused.status).toBe(BAD_REQUEST);
    expect(await errorOf(refused)).toBe(lengthError('categoryName', TEXT_LIMITS.name));
  });
});

describe('profile, partner invitation, sign-up, banking entity and uploads', () => {
  const profile = (overrides: Record<string, unknown>) =>
    send('PUT', '/api/settings/profile', {
      firstName: 'Syn',
      lastName: 'Thetic',
      email: owner.user.email,
      location: 'Amsterdam',
      age: 35,
      retirementAge: 67,
      ...overrides,
    });

  test('profile fields are bounded', async () => {
    for (const field of ['firstName', 'lastName', 'location'] as const) {
      const limit = TEXT_FIELD_LIMITS.profile[field];
      expect((await profile({ [field]: text(limit) })).status).toBe(OK);
      const over = await profile({ [field]: text(limit + 1) });
      expect(over.status).toBe(BAD_REQUEST);
      expect(await errorOf(over)).toBe(lengthError(field, limit));
    }
    const domain = '@text-limits.integration.quro.test';
    const tooLong = `${text(TEXT_LIMITS.email - domain.length + 1)}${domain}`;
    const over = await profile({ email: tooLong });
    expect(over.status).toBe(BAD_REQUEST);
    expect(await errorOf(over)).toBe(lengthError('email', TEXT_LIMITS.email));
  });

  test('an unchanged long profile value is accepted', async () => {
    const longLocation = text(TEXT_LIMITS.name + 20);
    await db.update(users).set({ location: longLocation }).where(eq(users.id, owner.user.id));
    expect((await profile({ location: longLocation, age: 36 })).status).toBe(OK);
    expect((await profile({ location: `${longLocation}!` })).status).toBe(BAD_REQUEST);
    expect((await profile({ location: 'Amsterdam' })).status).toBe(OK);
  });

  test('partner invitation and sign-up emails are bounded', async () => {
    const domain = '@text-limits.integration.quro.test';
    const atLimit = `${text(TEXT_LIMITS.email - domain.length)}${domain}`;
    const over = `${text(TEXT_LIMITS.email - domain.length + 1)}${domain}`;

    const invite = await send('POST', '/api/partner/invite', { email: over });
    expect(invite.status).toBe(BAD_REQUEST);
    expect(await errorOf(invite)).toBe(lengthError('email', TEXT_LIMITS.email));
    const inviteAtLimit = await send('POST', '/api/partner/invite', { email: atLimit });
    expect(await errorOf(inviteAtLimit)).not.toBe(lengthError('email', TEXT_LIMITS.email));

    const signUp = (overrides: Record<string, unknown>) =>
      integration.request('/api/auth/signup', {
        method: 'POST',
        json: {
          firstName: 'Syn',
          lastName: 'Thetic',
          email: 'signup@text-limits.integration.quro.test',
          password: 'long-enough-password-1',
          age: 35,
          retirementAge: 67,
          ...overrides,
        },
      });
    for (const [field, value, limit] of [
      ['email', over, TEXT_LIMITS.email],
      ['firstName', text(TEXT_LIMITS.personName + 1), TEXT_LIMITS.personName],
      ['lastName', text(TEXT_LIMITS.personName + 1), TEXT_LIMITS.personName],
    ] as const) {
      const response = await signUp({ [field]: value });
      expect(response.status).toBe(BAD_REQUEST);
      expect(await errorOf(response)).toBe(lengthError(field, limit));
    }
    const accepted = await signUp({ email: atLimit.replace('x', 'y') });
    expect(accepted.status).not.toBe(BAD_REQUEST);
  });

  test('banking entity names are bounded', async () => {
    const accountId = await createdId('/api/savings/accounts', {
      name: 'Entity account',
      bank: 'Synthetic Bank',
      balance: 0,
      currency: 'EUR',
      interestRate: 1,
      accountType: 'Easy Access',
      color: '#0ea5e9',
      emoji: 'S',
    });
    const path = `/api/savings/accounts/${accountId}/banking-entity`;
    const manual = (overrides: Record<string, unknown>) =>
      send('PATCH', path, {
        mode: 'manual',
        entityName: 'Synthetic Bank NV',
        scheme: 'NL DGS',
        cap: 100000,
        currency: 'EUR',
        ...overrides,
      });
    for (const field of ['entityName', 'scheme'] as const) {
      const limit = TEXT_FIELD_LIMITS.bankingEntity[field];
      expect((await manual({ [field]: text(limit) })).status).toBe(OK);
      const over = await manual({ [field]: text(limit + 1) });
      expect(over.status).toBe(BAD_REQUEST);
      expect(await errorOf(over)).toBe(lengthError(field, limit));
    }
    const known = await send('PATCH', path, {
      mode: 'known',
      entityId: text(TEXT_LIMITS.name + 1),
    });
    expect(known.status).toBe(BAD_REQUEST);
    expect(await errorOf(known)).toBe(lengthError('entityId', TEXT_LIMITS.name));
  });

  test('uploaded document file names are bounded', async () => {
    const payslipId = await createdId('/api/salary/payslips', {
      month: 'June 2026',
      date: '2026-06-30',
      gross: 5000,
      tax: 1000,
      pension: 200,
      net: 3800,
      currency: 'EUR',
    });
    const upload = (name: string) => {
      const form = new FormData();
      form.set('file', new File(['%PDF-1.4\n%%EOF\n'], name, { type: 'application/pdf' }));
      return integration.request(`/api/salary/payslips/${payslipId}/document`, {
        method: 'POST',
        cookie: owner.cookie,
        body: form,
      });
    };
    const suffix = '.pdf';
    const over = await upload(`${text(TEXT_LIMITS.fileName - suffix.length + 1)}${suffix}`);
    expect(over.status).toBe(BAD_REQUEST);
    expect(await errorOf(over)).toBe(lengthError('fileName', TEXT_LIMITS.fileName));
    const atLimit = await upload(`${text(TEXT_LIMITS.fileName - suffix.length)}${suffix}`);
    expect(atLimit.status).toBe(CREATED);
  });
});
