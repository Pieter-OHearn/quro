import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import type { BudgetCategory, Employment, PlanAssumptions, RunwayResponse } from '@quro/shared';
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

  test('creates and updates shared employment while preserving explicit zeroes', async () => {
    const owner = await integration.signUp('runway-upserts');
    const employment = await readData<Employment>(
      await integration.request('/api/employments', {
        method: 'POST',
        cookie: owner.cookie,
        json: {
          employerName: 'Quro BV',
          employmentType: 'employed',
          serviceStartDate: '2024-08-05',
          endDate: null,
          noticePeriodMonths: 0,
          isPrimary: true,
        },
      }),
      201,
    );
    expect(employment).toMatchObject({
      employerName: 'Quro BV',
      employmentType: 'employed',
      serviceStartDate: '2024-08-05',
      noticePeriodMonths: 0,
    });

    await readData<Employment>(
      await integration.request(`/api/employments/${employment.id}`, {
        method: 'PATCH',
        cookie: owner.cookie,
        json: { serviceStartDate: '2023-08-05' },
      }),
    );
    const payslip = await readData<{ id: number; employmentId: number | null }>(
      await integration.request('/api/salary/payslips', {
        method: 'POST',
        cookie: owner.cookie,
        json: {
          month: 'Aug 2026',
          date: '2026-08-01',
          gross: 5_000,
          tax: 1_500,
          pension: 250,
          net: 3_250,
          bonus: null,
          currency: 'EUR',
        },
      }),
      201,
    );
    expect(payslip.employmentId).toBe(employment.id);
    const secondary = await readData<Employment>(
      await integration.request('/api/employments', {
        method: 'POST',
        cookie: owner.cookie,
        json: {
          employerName: 'Side Role BV',
          employmentType: 'employed',
          serviceStartDate: '2025-01-01',
          endDate: null,
          noticePeriodMonths: 1,
          isPrimary: false,
        },
      }),
      201,
    );
    const secondaryPayslip = await readData<{ id: number; employmentId: number | null }>(
      await integration.request('/api/salary/payslips', {
        method: 'POST',
        cookie: owner.cookie,
        json: {
          employmentId: secondary.id,
          month: 'Aug 2026',
          date: '2026-08-10',
          gross: 15_000,
          tax: 5_000,
          pension: 500,
          net: 9_500,
          bonus: null,
          currency: 'EUR',
        },
      }),
      201,
    );
    expect(secondaryPayslip.employmentId).toBe(secondary.id);
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
    expect(runway.incomeSupport.salaryBasis.status).toBe('linked_payslips');
    expect(runway.incomeSupport.salaryBasis.payslipId).toBe(payslip.id);
    expect(runway.tiers.filter((tier) => !tier.included).map((tier) => tier.tier)).toEqual([2, 3]);

    const demotion = await integration.request(`/api/employments/${employment.id}`, {
      method: 'PATCH',
      cookie: owner.cookie,
      json: { isPrimary: false },
    });
    expect(demotion.status).toBe(400);

    const unlinked = await readData<{ employmentId: number | null }>(
      await integration.request(`/api/salary/payslips/${payslip.id}`, {
        method: 'PATCH',
        cookie: owner.cookie,
        json: { employmentId: null },
      }),
    );
    expect(unlinked.employmentId).toBeNull();
    const fallbackRunway = await readData<RunwayResponse>(
      await integration.request('/api/plan/runway', { cookie: owner.cookie }),
    );
    expect(fallbackRunway.incomeSupport.salaryBasis.status).toBe('unlinked_fallback');
    expect(fallbackRunway.incomeSupport.salaryBasis.payslipId).toBe(payslip.id);

    const endedPrimary = await readData<Employment>(
      await integration.request(`/api/employments/${employment.id}`, {
        method: 'PATCH',
        cookie: owner.cookie,
        json: { endDate: '2024-08-05' },
      }),
    );
    expect(endedPrimary.isPrimary).toBe(false);
    const transitionedEmployments = await readData<Employment[]>(
      await integration.request('/api/employments', { cookie: owner.cookie }),
    );
    expect(transitionedEmployments.find((item) => item.id === secondary.id)?.isPrimary).toBe(true);
    const transitionedRunway = await readData<RunwayResponse>(
      await integration.request('/api/plan/runway', { cookie: owner.cookie }),
    );
    expect(transitionedRunway.employment.primary?.id).toBe(secondary.id);
    expect(transitionedRunway.incomeSupport.salaryBasis.payslipId).toBe(secondaryPayslip.id);

    expect(
      (
        await integration.request(`/api/employments/${secondary.id}`, {
          method: 'DELETE',
          cookie: owner.cookie,
        })
      ).status,
    ).toBe(204);
    const remaining = await readData<Employment[]>(
      await integration.request('/api/employments', { cookie: owner.cookie }),
    );
    expect(remaining).toHaveLength(1);
    expect(remaining[0]).toMatchObject({ id: employment.id, isPrimary: true });
  });

  test('validates plan inputs and classifies a category name across months', async () => {
    const owner = await integration.signUp('runway-validation');
    const invalid = await integration.request('/api/employments', {
      method: 'POST',
      cookie: owner.cookie,
      json: {
        employerName: '',
        employmentType: 'employed',
        serviceStartDate: 'bad',
        endDate: null,
        noticePeriodMonths: 25,
      },
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
