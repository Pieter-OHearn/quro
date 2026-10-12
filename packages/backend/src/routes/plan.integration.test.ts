import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import type {
  BudgetCategory,
  Employment,
  PlanAssumptions,
  RunwayResponse,
  SavingsAccount,
} from '@quro/shared';
import { db, queryClient } from '../db/client';
import { payslips } from '../db/schema';
import { createIntegrationHelpers } from '../test/integration';
import { buildRunwayResponse, runwayEstimateFlags } from './plan';
import { useFixtureCurrencyRates } from '../test/currencyRates';

const integration = createIntegrationHelpers('plan.integration.quro.test');

async function readData<T>(response: Response, status = 200): Promise<T> {
  expect(response.status).toBe(status);
  const body = (await response.json()) as { data: T };
  return body.data;
}

beforeAll(async () => {
  await integration.cleanup();
  await useFixtureCurrencyRates('plan-integration-fixture');
});
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

  test('uses Australian FCS, Fair Work redundancy, and user-supplied JobSeeker estimates', async () => {
    const owner = await integration.signUp('runway-australia');
    await readData(
      await integration.request('/api/settings/preferences', {
        method: 'PUT',
        cookie: owner.cookie,
        json: { baseCurrency: 'AUD', numberFormat: 'en-US', jurisdiction: 'AU' },
      }),
    );
    await readData(
      await integration.request('/api/employments', {
        method: 'POST',
        cookie: owner.cookie,
        json: {
          employerName: 'Quro Australia Pty Ltd',
          employmentType: 'employed',
          serviceStartDate: '2017-01-01',
          endDate: null,
          noticePeriodMonths: 1,
          isPrimary: true,
        },
      }),
      201,
    );
    await readData(
      await integration.request('/api/salary/payslips', {
        method: 'POST',
        cookie: owner.cookie,
        json: {
          month: 'Jul 2026',
          date: '2026-07-31',
          gross: 6_500,
          tax: 1_950,
          pension: 0,
          net: 4_550,
          bonus: null,
          currency: 'AUD',
        },
      }),
      201,
    );
    await readData(
      await integration.request('/api/savings/accounts', {
        method: 'POST',
        cookie: owner.cookie,
        json: {
          name: 'Emergency reserve',
          bank: 'CommBank',
          balance: 250_000,
          currency: 'AUD',
          interestRate: 4,
          accountType: 'Easy Access',
          color: '#334155',
          emoji: '🏦',
          isJoint: false,
        },
      }),
      201,
    );

    const derived = await readData<RunwayResponse>(
      await integration.request('/api/plan/runway', { cookie: owner.cookie }),
    );
    expect(derived.jurisdiction.code).toBe('AU');
    expect(derived.baseCurrency).toBe('EUR');
    expect(derived.jurisdiction.labels.unemploymentShort).toBe('JobSeeker');
    expect(derived.depositGuarantee[0]).toMatchObject({
      entityId: 'cba-au',
      excess: 0,
      confidence: 'verified',
    });
    expect(derived.depositGuarantee[0]?.cap).toBeCloseTo(250_000 * 0.58, 2);
    expect(derived.incomeSupport.severance).toMatchObject({
      status: 'included',
    });
    expect(derived.incomeSupport.severance.gross).toBeCloseTo(24_000 * 0.58, 2);
    expect(derived.incomeSupport.severance.net).toBeCloseTo(16_800 * 0.58, 2);
    expect(derived.incomeSupport.unemployment.status).toBe('unknown');

    await readData(
      await integration.request('/api/plan/assumptions', {
        method: 'PUT',
        cookie: owner.cookie,
        json: { benefitMonthlyOverride: 1_250, benefitMaxMonthsOverride: 6 },
      }),
    );
    const confirmed = await readData<RunwayResponse>(
      await integration.request('/api/plan/runway', { cookie: owner.cookie }),
    );
    expect(confirmed.incomeSupport.unemployment).toMatchObject({
      status: 'included',
      durationMonths: 6,
      durationSource: 'override',
    });
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
    const preset = await readData<BudgetCategory>(
      await integration.request('/api/budget/categories', {
        method: 'POST',
        cookie: owner.cookie,
        json: {
          name: 'Restaurants & Bars',
          emoji: '🍽️',
          budgeted: 150,
          spent: 0,
          color: '#f97316',
          month: 'Jun',
          year: 2026,
        },
      }),
      201,
    );
    expect(preset).toMatchObject({ expenseClass: 'discretionary', expenseClassConfirmed: true });

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

    const missingNullableFields = await integration.request('/api/employments', {
      method: 'POST',
      cookie: owner.cookie,
      json: { employerName: 'Freelance', employmentType: 'self_employed' },
    });
    expect(missingNullableFields.status).toBe(400);
    expect(await missingNullableFields.json()).toEqual({
      error: 'Start date must be a valid ISO date',
    });

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
      expect(category.expenseClassConfirmed).toBe(false);
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
    expect(classified.every((category) => category.expenseClassConfirmed)).toBe(true);
  });

  test('keeps banking entities independent of the planning jurisdiction', async () => {
    const owner = await integration.signUp('banking-entity-jurisdiction');
    const account = await readData<SavingsAccount>(
      await integration.request('/api/savings/accounts', {
        method: 'POST',
        cookie: owner.cookie,
        json: {
          name: 'International reserve',
          bank: 'bunq',
          balance: 25_000,
          currency: 'EUR',
          interestRate: 2,
          accountType: 'Easy Access',
          color: '#334155',
          emoji: '🏦',
          isJoint: false,
        },
      }),
      201,
    );
    await readData<SavingsAccount>(
      await integration.request(`/api/savings/accounts/${account.id}/banking-entity`, {
        method: 'PATCH',
        cookie: owner.cookie,
        json: { mode: 'known', entityId: 'bunq' },
      }),
    );
    await readData(
      await integration.request('/api/settings/preferences', {
        method: 'PUT',
        cookie: owner.cookie,
        json: { baseCurrency: 'AUD', numberFormat: 'en-US', jurisdiction: 'AU' },
      }),
    );

    const entities = await readData<Array<{ id: string }>>(
      await integration.request('/api/savings/banking-entities', { cookie: owner.cookie }),
    );
    expect(entities.some((entity) => entity.id === 'bunq')).toBe(true);
    expect(entities.some((entity) => entity.id === 'cba-au')).toBe(true);
    await readData<SavingsAccount>(
      await integration.request(`/api/savings/accounts/${account.id}/banking-entity`, {
        method: 'PATCH',
        cookie: owner.cookie,
        json: { mode: 'known', entityId: 'bunq' },
      }),
    );

    const runway = await readData<RunwayResponse>(
      await integration.request('/api/plan/runway', { cookie: owner.cookie }),
    );
    expect(runway.depositGuarantee[0]).toMatchObject({
      entityId: 'bunq',
      confidence: 'verified',
      accountIds: [account.id],
    });
  });

  test('lets users resolve banking entities and clears stale confirmations after a rename', async () => {
    const owner = await integration.signUp('banking-entity-review');
    const account = await readData<SavingsAccount>(
      await integration.request('/api/savings/accounts', {
        method: 'POST',
        cookie: owner.cookie,
        json: {
          name: 'Emergency reserve',
          bank: 'Mystery Brand',
          balance: 25_000,
          currency: 'EUR',
          interestRate: 2,
          accountType: 'Easy Access',
          color: '#334155',
          emoji: '🏦',
          isJoint: false,
        },
      }),
      201,
    );
    const unresolved = await readData<RunwayResponse>(
      await integration.request('/api/plan/runway', { cookie: owner.cookie }),
    );
    expect(unresolved.depositGuarantee[0]).toMatchObject({
      confidence: 'unverified',
      accountIds: [account.id],
    });

    const entities = await readData<Array<{ id: string }>>(
      await integration.request('/api/savings/banking-entities', { cookie: owner.cookie }),
    );
    expect(entities.some((entity) => entity.id === 'bunq')).toBe(true);

    const invalidEntity = await integration.request(
      `/api/savings/accounts/${account.id}/banking-entity`,
      {
        method: 'PATCH',
        cookie: owner.cookie,
        json: { mode: 'known', entityId: 'not-a-real-entity' },
      },
    );
    expect(invalidEntity.status).toBe(400);

    const knownConfirmation = await readData<SavingsAccount>(
      await integration.request(`/api/savings/accounts/${account.id}/banking-entity`, {
        method: 'PATCH',
        cookie: owner.cookie,
        json: { mode: 'known', entityId: 'bunq' },
      }),
    );
    expect(knownConfirmation).toMatchObject({
      bankingEntityId: 'bunq',
      bankingEntityName: 'bunq B.V.',
      depositGuaranteeScheme: 'Nederlandse Depositogarantie',
      depositGuaranteeCap: 100_000,
      depositGuaranteeCurrency: 'EUR',
    });
    const cleared = await readData<SavingsAccount>(
      await integration.request(`/api/savings/accounts/${account.id}/banking-entity`, {
        method: 'PATCH',
        cookie: owner.cookie,
        json: { mode: 'clear' },
      }),
    );
    expect(cleared.bankingEntityConfirmedAt).toBeNull();

    const invalidManual = await integration.request(
      `/api/savings/accounts/${account.id}/banking-entity`,
      {
        method: 'PATCH',
        cookie: owner.cookie,
        json: {
          mode: 'manual',
          entityName: 'Mystery Bank Europe N.V.',
          scheme: 'Example national deposit guarantee',
          cap: 0,
          currency: 'AUD',
        },
      },
    );
    expect(invalidManual.status).toBe(400);

    const manuallyConfirmed = await readData<SavingsAccount>(
      await integration.request(`/api/savings/accounts/${account.id}/banking-entity`, {
        method: 'PATCH',
        cookie: owner.cookie,
        json: {
          mode: 'manual',
          entityName: 'Mystery Bank Europe N.V.',
          scheme: 'Example national deposit guarantee',
          cap: 250_000,
          currency: 'AUD',
        },
      }),
    );
    expect(manuallyConfirmed).toMatchObject({
      bankingEntityId: 'manual:mysteryeurope',
      bankingEntityName: 'Mystery Bank Europe N.V.',
      depositGuaranteeScheme: 'Example national deposit guarantee',
      depositGuaranteeCap: 250_000,
      depositGuaranteeCurrency: 'AUD',
    });
    expect(manuallyConfirmed.bankingEntityConfirmedAt).toBeTruthy();
    const resolved = await readData<RunwayResponse>(
      await integration.request('/api/plan/runway', { cookie: owner.cookie }),
    );
    expect(resolved.depositGuarantee[0]).toMatchObject({
      entityId: 'manual:mysteryeurope',
      confidence: 'verified',
      accountIds: [account.id],
    });
    expect(resolved.depositGuarantee[0]?.cap).not.toBe(100_000);

    const renamed = await readData<SavingsAccount>(
      await integration.request(`/api/savings/accounts/${account.id}`, {
        method: 'PATCH',
        cookie: owner.cookie,
        json: { bank: 'A Different Brand' },
      }),
    );
    expect(renamed.bankingEntityConfirmedAt).toBeNull();
    expect(renamed.bankingEntityId).toBeNull();

    const stranger = await integration.signUp('banking-entity-stranger');
    expect(
      (
        await integration.request(`/api/savings/accounts/${account.id}/banking-entity`, {
          method: 'PATCH',
          cookie: stranger.cookie,
          json: { mode: 'known', entityId: 'bunq' },
        })
      ).status,
    ).toBe(404);
  });
});

test('a runway request executes its primary employment lookup once', async () => {
  const owner = await integration.signUp('primary-employment-query');
  const queries: string[] = [];
  const originalDebug = queryClient.options.debug;
  queryClient.options.debug = (_connection, query) => {
    queries.push(query);
  };
  try {
    const runway = await integration.request('/api/plan/runway', { cookie: owner.cookie });
    expect(runway.status).toBe(200);
    expect(queries.filter((query) => query.includes('from "employments"'))).toHaveLength(1);
  } finally {
    queryClient.options.debug = originalDebug;
  }
});

test('rules carried past their published or reviewed period make the runway an estimate', async () => {
  const owner = await integration.signUp('runway-stale-rules');
  const runwayOn = async (jurisdiction: 'NL' | 'AU', isoDate: string) => {
    await readData(
      await integration.request('/api/settings/preferences', {
        method: 'PUT',
        cookie: owner.cookie,
        json: { baseCurrency: 'EUR', numberFormat: 'en-US', jurisdiction },
      }),
    );
    return (await buildRunwayResponse(owner.user.id, null, new Date(`${isoDate}T12:00:00Z`)))!;
  };

  // NL publishes bounded periods: the day after the last one, its rules are carried forward.
  expect((await runwayOn('NL', '2026-12-31')).jurisdiction.isExtrapolated).toBe(false);
  const nlStale = await runwayOn('NL', '2027-01-01');
  expect(nlStale.jurisdiction.isExtrapolated).toBe(true);
  expect(nlStale.isEstimated).toBe(true);

  // The AU redundancy table is open-ended: it goes stale twelve months after its last review.
  expect((await runwayOn('AU', '2027-08-11')).jurisdiction.isExtrapolated).toBe(false);
  const auStale = await runwayOn('AU', '2027-08-12');
  expect(auStale.jurisdiction.isExtrapolated).toBe(true);
  expect(auStale.isEstimated).toBe(true);

  // With every other input confirmed, the stale rule alone is what marks the estimate.
  const confirmed = {
    salaryBasis: { status: 'linked_payslips' },
    unemployment: { status: 'included' },
  } as RunwayResponse['incomeSupport'];
  const flags = (isExtrapolated: boolean) =>
    runwayEstimateFlags({ categories: [], budgetTxns: [] }, confirmed, {
      ...auStale.jurisdiction,
      isExtrapolated,
    });
  expect(flags(false)).toEqual({ budgetCurrencyNeedsReview: false, isEstimated: false });
  expect(flags(true)).toEqual({ budgetCurrencyNeedsReview: false, isEstimated: true });
});

async function setJurisdiction(cookie: string, jurisdiction: 'NL' | 'AU' | 'GENERIC') {
  await readData(
    await integration.request('/api/settings/preferences', {
      method: 'PUT',
      cookie,
      json: { baseCurrency: 'EUR', numberFormat: 'en-US', jurisdiction },
    }),
  );
}

function payslipRow(userId: number, tax: number) {
  return {
    userId,
    month: 'May 2026',
    date: '2026-05-29',
    gross: 10_000,
    tax,
    pension: 0,
    net: 10_000 - tax,
    currency: 'EUR' as const,
  };
}

test('the last twelve payslips break a shared date by entry order', async () => {
  const owner = await integration.signUp('runway-payslip-ties');
  await setJurisdiction(owner.cookie, 'GENERIC');
  // Twenty-four payslips on one date: the twelve entered last carry 30% tax, the others none.
  await db.insert(payslips).values(Array.from({ length: 12 }, () => payslipRow(owner.user.id, 0)));
  await db
    .insert(payslips)
    .values(Array.from({ length: 12 }, () => payslipRow(owner.user.id, 3_000)));

  const runway = (await buildRunwayResponse(
    owner.user.id,
    null,
    new Date('2026-06-15T12:00:00Z'),
  ))!;
  expect(runway.incomeSupport.taxRateSource).toBe('payslips');
  expect(runway.incomeSupport.effectiveTaxRate).toBeCloseTo(0.3, 10);
});

test('runway rule metadata lists the default tax rate only when the runway uses it', async () => {
  const asOf = new Date('2026-08-01T12:00:00Z');
  const withoutPayslips = await integration.signUp('runway-rules-default-tax');
  await setJurisdiction(withoutPayslips.cookie, 'AU');
  const defaultTax = (await buildRunwayResponse(withoutPayslips.user.id, null, asOf))!;
  expect(defaultTax.incomeSupport.taxRateSource).toBe('jurisdiction_default');
  // The Australian default tax rate (from 2025-07-01) is newer than the redundancy table.
  expect(defaultTax.jurisdiction.rulesEffectiveFrom).toBe('2025-07-01');

  const withPayslips = await integration.signUp('runway-rules-payslip-tax');
  await setJurisdiction(withPayslips.cookie, 'AU');
  await db.insert(payslips).values(payslipRow(withPayslips.user.id, 2_000));
  const payslipTax = (await buildRunwayResponse(withPayslips.user.id, null, asOf))!;
  expect(payslipTax.incomeSupport.taxRateSource).toBe('payslips');
  expect(payslipTax.jurisdiction.rulesEffectiveFrom).toBe('2010-01-01');

  // Without unemployment or severance rules, a payslip-based runway uses no published rule.
  const generic = await integration.signUp('runway-rules-generic');
  await setJurisdiction(generic.cookie, 'GENERIC');
  await db.insert(payslips).values(payslipRow(generic.user.id, 2_000));
  const noRules = (await buildRunwayResponse(generic.user.id, null, asOf))!;
  expect(noRules.jurisdiction.rulesEffectiveFrom).toBeNull();
  expect(noRules.jurisdiction.isExtrapolated).toBe(false);
});
