import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { db } from '../db/client';
import { mortgages, properties } from '../db/schema';
import { createIntegrationHelpers, type AuthSession } from '../test/integration';

const integration = createIntegrationHelpers('ledger-edit-rollback.integration.quro.test');

beforeAll(() => integration.cleanup());
afterAll(() => integration.cleanup());

async function created<T>(response: Response): Promise<T> {
  expect(response.status).toBe(201);
  return ((await response.json()) as { data: T }).data;
}

async function createProperty(owner: AuthSession, address: string) {
  return created<{ id: number }>(
    await integration.request('/api/investments/properties', {
      method: 'POST',
      cookie: owner.cookie,
      json: {
        address,
        propertyType: 'primary_home',
        purchasePrice: 280000,
        currentValue: 300000,
        monthlyRent: 0,
        currency: 'EUR',
      },
    }),
  );
}

async function createMortgage(owner: AuthSession, propertyId: number) {
  return created<{ id: number }>(
    await integration.request('/api/mortgages', {
      method: 'POST',
      cookie: owner.cookie,
      json: {
        linkedPropertyId: propertyId,
        lender: 'Synthetic Bank',
        originalAmount: 300000,
        outstandingBalance: 250000,
        monthlyPayment: 1500,
        interestRate: 3,
        rateType: 'fixed',
        repaymentType: 'annuity',
        fixedUntil: '2031-06-30',
        termYears: 30,
        startDate: '2021-07-01',
        endDate: '2051-07-01',
      },
    }),
  );
}

async function outstandingBalance(mortgageId: number) {
  const [row] = await db.select().from(mortgages).where(eq(mortgages.id, mortgageId));
  return Number(row!.outstandingBalance);
}

async function currentValue(propertyId: number) {
  const [row] = await db.select().from(properties).where(eq(properties.id, propertyId));
  return Number(row!.currentValue);
}

describe('mortgage transaction edits', () => {
  let owner: AuthSession;
  let stranger: AuthSession;
  let mortgageId: number;
  let strangerMortgageId: number;
  let transactionId: number;

  beforeAll(async () => {
    owner = await integration.signUp('mortgage-owner');
    stranger = await integration.signUp('mortgage-stranger');
    mortgageId = (await createMortgage(owner, (await createProperty(owner, 'Own home')).id)).id;
    strangerMortgageId = (
      await createMortgage(stranger, (await createProperty(stranger, 'Other home')).id)
    ).id;
    const transaction = await created<{ id: number }>(
      await integration.request('/api/mortgages/transactions', {
        method: 'POST',
        cookie: owner.cookie,
        json: {
          mortgageId,
          type: 'repayment',
          amount: 1500,
          interest: 500,
          principal: 1000,
          date: '2026-03-01',
        },
      }),
    );
    transactionId = transaction.id;
    expect(await outstandingBalance(mortgageId)).toBe(249000);
  });

  const edit = (json: unknown) =>
    integration.request(`/api/mortgages/transactions/${transactionId}`, {
      method: 'PATCH',
      cookie: owner.cookie,
      json,
    });

  test('a valid edit moves the balance by the difference', async () => {
    expect((await edit({ principal: 800, interest: 700 })).status).toBe(200);
    expect(await outstandingBalance(mortgageId)).toBe(249200);
    expect((await edit({ principal: 1000, interest: 500 })).status).toBe(200);
    expect(await outstandingBalance(mortgageId)).toBe(249000);
  });

  test('an edit that would overdraw the balance is refused and changes nothing', async () => {
    const response = await edit({ amount: 400000, principal: 400000, interest: 0 });
    expect(response.status).toBe(400);
    expect(await outstandingBalance(mortgageId)).toBe(249000);
  });

  test('an edit that points at a mortgage the user cannot see is refused and changes nothing', async () => {
    const response = await edit({ mortgageId: strangerMortgageId });
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'Mortgage not found' });
    expect(await outstandingBalance(mortgageId)).toBe(249000);
    expect(await outstandingBalance(strangerMortgageId)).toBe(250000);
  });
});

describe('property transaction edits', () => {
  let owner: AuthSession;
  let stranger: AuthSession;
  let propertyId: number;
  let strangerPropertyId: number;
  let transactionId: number;

  beforeAll(async () => {
    owner = await integration.signUp('property-owner');
    stranger = await integration.signUp('property-stranger');
    propertyId = (await createProperty(owner, 'Own flat')).id;
    strangerPropertyId = (await createProperty(stranger, 'Other flat')).id;
    const transaction = await created<{ id: number }>(
      await integration.request('/api/investments/property-transactions', {
        method: 'POST',
        cookie: owner.cookie,
        json: { propertyId, type: 'valuation', amount: 310000, date: '2026-03-01' },
      }),
    );
    transactionId = transaction.id;
    expect(await currentValue(propertyId)).toBe(310000);
  });

  const edit = (json: unknown) =>
    integration.request(`/api/investments/property-transactions/${transactionId}`, {
      method: 'PATCH',
      cookie: owner.cookie,
      json,
    });

  test('a valid edit moves the current value with the valuation', async () => {
    expect((await edit({ amount: 305000 })).status).toBe(200);
    expect(await currentValue(propertyId)).toBe(305000);
    expect((await edit({ amount: 310000 })).status).toBe(200);
    expect(await currentValue(propertyId)).toBe(310000);
  });

  test('an edit into a type the property ledger does not keep is refused and changes nothing', async () => {
    const response = await edit({ type: 'repayment' });
    expect(response.status).toBe(400);
    expect(await currentValue(propertyId)).toBe(310000);
  });

  test('an edit that points at a property the user cannot see is refused and changes nothing', async () => {
    const response = await edit({ propertyId: strangerPropertyId });
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'Property not found' });
    expect(await currentValue(propertyId)).toBe(310000);
    expect(await currentValue(strangerPropertyId)).toBe(300000);
  });
});
