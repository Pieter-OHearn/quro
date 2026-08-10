import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import type {
  BudgetCategory,
  EmploymentProfile,
  PlanAssumptions,
  RunwayResponse,
} from '@quro/shared';
import { createIntegrationHelpers } from '../test/integration';

const integration = createIntegrationHelpers('plan.integration.quro.test');

async function readData<T>(response: Response, status = 200): Promise<T> {
  expect(response.status).toBe(status);
  const body = (await response.json()) as { data: T };
  return body.data;
}

beforeAll(() => integration.cleanup());
afterAll(() => integration.cleanup());

describe('plan integration', () => {
  test('renders a useful zero-setup runway and protects the route', async () => {
    expect((await integration.request('/api/plan/runway')).status).toBe(401);
    const owner = await integration.signUp('runway-empty');
    const runway = await readData<RunwayResponse>(
      await integration.request('/api/plan/runway', { cookie: owner.cookie }),
    );
    expect(runway).toMatchObject({
      baseCurrency: 'EUR',
      setupComplete: false,
      burn: { burnSource: 'derived_cashflow', lean: 0, current: 0 },
      runway: { monthsWithIncomeSupport: null, band: 'resilient' },
    });
    expect(runway.tiers.map((tier) => tier.amount)).toEqual([0, 0, 0]);
  });

  test('upserts employment and assumptions while preserving explicit zeroes', async () => {
    const owner = await integration.signUp('runway-upserts');
    const employment = await readData<EmploymentProfile>(
      await integration.request('/api/plan/employment', {
        method: 'PUT',
        cookie: owner.cookie,
        json: {
          employmentType: 'employed',
          tenureMonths: 24,
          noticePeriodMonths: 0,
          hasDependents: false,
        },
      }),
    );
    expect(employment).toMatchObject({
      employmentType: 'employed',
      tenureMonths: 24,
      noticePeriodMonths: 0,
      hasDependents: false,
    });

    await readData<EmploymentProfile>(
      await integration.request('/api/plan/employment', {
        method: 'PUT',
        cookie: owner.cookie,
        json: { tenureMonths: 36 },
      }),
    );
    const assumptions = await readData<PlanAssumptions>(
      await integration.request('/api/plan/assumptions', {
        method: 'PUT',
        cookie: owner.cookie,
        json: {
          leanBurnOverride: 0,
          emergencyLifestylePct: 0,
          excludedTiers: [2, 3],
          countFullJointBalances: false,
          benefitMonthlyOverride: 0,
          benefitMaxMonthsOverride: 0,
        },
      }),
    );
    expect(assumptions).toMatchObject({
      leanBurnOverride: 0,
      emergencyLifestylePct: 0,
      excludedTiers: [2, 3],
      countFullJointBalances: false,
      benefitMonthlyOverride: 0,
      benefitMaxMonthsOverride: 0,
    });

    const runway = await readData<RunwayResponse>(
      await integration.request('/api/plan/runway', { cookie: owner.cookie }),
    );
    expect(runway.setupComplete).toBe(true);
    expect(runway.tiers.filter((tier) => !tier.included).map((tier) => tier.tier)).toEqual([2, 3]);
  });

  test('validates plan inputs and classifies a category name across months', async () => {
    const owner = await integration.signUp('runway-validation');
    const invalid = await integration.request('/api/plan/employment', {
      method: 'PUT',
      cookie: owner.cookie,
      json: { tenureMonths: 721 },
    });
    expect(invalid.status).toBe(400);

    const ids: number[] = [];
    for (const [month, year] of [
      ['Jul', 2026],
      ['Aug', 2026],
    ] as const) {
      const category = await readData<BudgetCategory>(
        await integration.request('/api/budget/categories', {
          method: 'POST',
          cookie: owner.cookie,
          json: {
            name: 'Commuting',
            emoji: '🚆',
            budgeted: 150,
            spent: 0,
            color: '#334155',
            month,
            year,
          },
        }),
        201,
      );
      ids.push(category.id);
    }
    const classified = await readData<BudgetCategory[]>(
      await integration.request('/api/budget/categories/classify', {
        method: 'PATCH',
        cookie: owner.cookie,
        json: { updates: [{ id: ids[1], expenseClass: 'employment_linked' }] },
      }),
    );
    expect(classified).toHaveLength(2);
    expect(classified.every((category) => category.expenseClass === 'employment_linked')).toBe(
      true,
    );
  });
});
