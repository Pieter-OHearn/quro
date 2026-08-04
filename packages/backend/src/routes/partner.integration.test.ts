import { afterAll, beforeAll, describe, expect, mock, test } from 'bun:test';
import type { AuthSession } from '../test/integration';

// The dashboard's currency conversion lazily syncs FX rates from the real
// market data client when the cache is empty/stale. Mock it so this suite
// doesn't depend on a live network call to Yahoo Finance.
const FX_RATES_TO_EUR: Record<string, number> = {
  GBP: 1.18,
  USD: 0.92,
  AUD: 0.58,
  NZD: 0.53,
  CAD: 0.67,
  CHF: 1.04,
  SGD: 0.68,
};

await mock.module('../lib/marketDataClient', () => ({
  getMarketDataClient: () => ({
    lookupSymbol() {
      throw new Error('lookupSymbol is not used by this suite');
    },
    getLatestEod(symbols: string[]) {
      const now = new Date().toISOString();
      const entries = symbols.flatMap((symbol) => {
        const close = FX_RATES_TO_EUR[symbol.slice(0, 3)];
        if (close === undefined) return [];
        return [
          [
            symbol,
            { symbol, close, priceCurrency: 'EUR', eodDate: now.slice(0, 10), tradeLast: now },
          ],
        ];
      });
      return Object.fromEntries(entries);
    },
  }),
}));

const { createIntegrationHelpers } = await import('../test/integration');

const integration = createIntegrationHelpers('partner-it.quro.test');
const PARTNER_INVITE_ALLOWED_ATTEMPTS = 10;

type ApiDataResponse<T> = { data: T };
type ApiErrorResponse = { error: string };

type PartnerLinkBody = {
  id: number;
  status: 'pending' | 'accepted';
  role: 'requester' | 'addressee';
  partner: { id: number; firstName: string; lastName: string; email: string };
};

async function parseJson<T>(response: Response, expectedStatus: number): Promise<T> {
  expect(response.status).toBe(expectedStatus);
  return (await response.json()) as T;
}

function invitePartner(from: AuthSession, email: string): Promise<Response> {
  return Promise.resolve(
    integration.request('/api/partner/invite', {
      method: 'POST',
      cookie: from.cookie,
      json: { email },
    }),
  );
}

async function linkPartners(requester: AuthSession, addressee: AuthSession): Promise<void> {
  await parseJson(await invitePartner(requester, addressee.user.email), 201);
  await parseJson(
    await integration.request('/api/partner/accept', {
      method: 'POST',
      cookie: addressee.cookie,
    }),
    200,
  );
}

function unlinkPartner(session: AuthSession): Promise<Response> {
  return Promise.resolve(
    integration.request('/api/partner', { method: 'DELETE', cookie: session.cookie }),
  );
}

async function getPartnerLink(session: AuthSession): Promise<PartnerLinkBody | null> {
  const body = await parseJson<ApiDataResponse<PartnerLinkBody | null>>(
    await integration.request('/api/partner', { cookie: session.cookie }),
    200,
  );
  return body.data;
}

async function createSavingsAccount(
  session: AuthSession,
  overrides: Record<string, unknown> = {},
): Promise<{ id: number; balance: string; isJoint: boolean; userId: number }> {
  const body = await parseJson<
    ApiDataResponse<{ id: number; balance: string; isJoint: boolean; userId: number }>
  >(
    await integration.request('/api/savings/accounts', {
      method: 'POST',
      cookie: session.cookie,
      json: {
        name: 'Joint Test Account',
        bank: 'Test Bank',
        balance: 1000,
        currency: 'EUR',
        interestRate: 2,
        accountType: 'Easy Access',
        color: '#fff',
        emoji: 'S',
        ...overrides,
      },
    }),
    201,
  );
  return body.data;
}

async function createProperty(
  session: AuthSession,
  overrides: Record<string, unknown> = {},
): Promise<{ id: number; isJoint: boolean; mortgageId: number | null }> {
  const body = await parseJson<
    ApiDataResponse<{ id: number; isJoint: boolean; mortgageId: number | null }>
  >(
    await integration.request('/api/investments/properties', {
      method: 'POST',
      cookie: session.cookie,
      json: {
        address: '1 Shared Lane',
        propertyType: 'primary_home',
        purchasePrice: 280000,
        currentValue: 300000,
        monthlyRent: 0,
        currency: 'EUR',
        emoji: 'H',
        ...overrides,
      },
    }),
    201,
  );
  return body.data;
}

async function createMortgage(
  session: AuthSession,
  linkedPropertyId: number,
  overrides: Record<string, unknown> = {},
): Promise<{ id: number; isJoint: boolean; outstandingBalance: string }> {
  const body = await parseJson<
    ApiDataResponse<{ id: number; isJoint: boolean; outstandingBalance: string }>
  >(
    await integration.request('/api/mortgages', {
      method: 'POST',
      cookie: session.cookie,
      json: {
        linkedPropertyId,
        lender: 'Test Lender',
        originalAmount: 250000,
        outstandingBalance: 200000,
        propertyValue: 300000,
        monthlyPayment: 1200,
        interestRate: 3.1,
        rateType: 'fixed',
        fixedUntil: '2031-01-01',
        termYears: 30,
        startDate: '2021-01-01',
        endDate: '2051-01-01',
        overpaymentLimit: 10,
        ...overrides,
      },
    }),
    201,
  );
  return body.data;
}

function getSavingsAccount(session: AuthSession, id: number): Promise<Response> {
  return Promise.resolve(
    integration.request(`/api/savings/accounts/${id}`, { cookie: session.cookie }),
  );
}

describe('partner link lifecycle', () => {
  beforeAll(async () => {
    await integration.cleanup();
  });

  afterAll(async () => {
    await integration.cleanup();
  });

  test('rate limits repeated invite attempts by authenticated user', async () => {
    const requester = await integration.signUp('invite-rate-limit');
    const originalNodeEnv = process.env.NODE_ENV;

    try {
      process.env.NODE_ENV = 'development';
      for (let attempt = 0; attempt < PARTNER_INVITE_ALLOWED_ATTEMPTS; attempt += 1) {
        const response = await invitePartner(requester, integration.buildEmail('unknown-target'));
        expect(response.status).toBe(404);
      }

      const limitedResponse = await invitePartner(
        requester,
        integration.buildEmail('unknown-target'),
      );
      expect(limitedResponse.status).toBe(429);
      expect(await limitedResponse.json()).toEqual({
        error: 'Too many requests, please try again later',
      });
    } finally {
      process.env.NODE_ENV = originalNodeEnv;
    }
  });

  test('invite, accept, and unlink round trip with correct roles', async () => {
    const alice = await integration.signUp('alice', { firstName: 'Alice', lastName: 'A' });
    const ben = await integration.signUp('ben', { firstName: 'Ben', lastName: 'B' });

    const inviteBody = await parseJson<ApiDataResponse<PartnerLinkBody>>(
      await invitePartner(alice, ben.user.email.toUpperCase()),
      201,
    );
    expect(inviteBody.data).toMatchObject({
      status: 'pending',
      role: 'requester',
      partner: { id: ben.user.id, email: ben.user.email },
    });

    const benView = await getPartnerLink(ben);
    expect(benView).toMatchObject({
      status: 'pending',
      role: 'addressee',
      partner: { id: alice.user.id, firstName: 'Alice' },
    });

    await parseJson(
      await integration.request('/api/partner/accept', { method: 'POST', cookie: ben.cookie }),
      200,
    );

    expect(await getPartnerLink(alice)).toMatchObject({ status: 'accepted', role: 'requester' });
    expect(await getPartnerLink(ben)).toMatchObject({ status: 'accepted', role: 'addressee' });

    await parseJson(await unlinkPartner(alice), 200);
    expect(await getPartnerLink(alice)).toBeNull();
    expect(await getPartnerLink(ben)).toBeNull();
  });

  test('validates invites: unknown email, self-invite, and existing links', async () => {
    const carol = await integration.signUp('carol');
    const dave = await integration.signUp('dave');
    const erin = await integration.signUp('erin');

    const unknownResponse = await invitePartner(carol, integration.buildEmail('nobody'));
    expect(unknownResponse.status).toBe(404);

    const selfResponse = await invitePartner(carol, carol.user.email);
    expect(selfResponse.status).toBe(400);

    await parseJson(await invitePartner(carol, dave.user.email), 201);

    const doubleInvite = await invitePartner(carol, erin.user.email);
    expect(doubleInvite.status).toBe(409);

    const inviteTaken = await invitePartner(erin, dave.user.email);
    expect(inviteTaken.status).toBe(409);

    // Requester cannot accept their own invite.
    const requesterAccept = await integration.request('/api/partner/accept', {
      method: 'POST',
      cookie: carol.cookie,
    });
    expect(requesterAccept.status).toBe(404);

    // Addressee declines; both sides are clear again.
    await parseJson(
      await integration.request('/api/partner/decline', { method: 'POST', cookie: dave.cookie }),
      200,
    );
    expect(await getPartnerLink(carol)).toBeNull();

    // Accept with nothing pending is a 404.
    const staleAccept = await integration.request('/api/partner/accept', {
      method: 'POST',
      cookie: dave.cookie,
    });
    expect(staleAccept.status).toBe(404);

    // Requester can cancel a pending invite via DELETE.
    await parseJson(await invitePartner(carol, dave.user.email), 201);
    await parseJson(await unlinkPartner(carol), 200);
    expect(await getPartnerLink(dave)).toBeNull();
  });

  test('rejects isJoint without an accepted link (none or pending)', async () => {
    const frank = await integration.signUp('frank');
    const grace = await integration.signUp('grace');

    const noLinkResponse = await integration.request('/api/savings/accounts', {
      method: 'POST',
      cookie: frank.cookie,
      json: {
        name: 'Solo',
        bank: 'Bank',
        balance: 100,
        currency: 'EUR',
        interestRate: 1,
        accountType: 'Easy Access',
        color: '#fff',
        emoji: 'S',
        isJoint: true,
      },
    });
    const noLinkBody = await parseJson<ApiErrorResponse>(noLinkResponse, 400);
    expect(noLinkBody.error).toBe('No partner linked');

    await parseJson(await invitePartner(frank, grace.user.email), 201);
    const pendingResponse = await integration.request('/api/savings/accounts', {
      method: 'POST',
      cookie: frank.cookie,
      json: {
        name: 'Still Solo',
        bank: 'Bank',
        balance: 100,
        currency: 'EUR',
        interestRate: 1,
        accountType: 'Easy Access',
        color: '#fff',
        emoji: 'S',
        isJoint: true,
      },
    });
    expect(pendingResponse.status).toBe(400);
  });
});

describe('joint savings access', () => {
  beforeAll(async () => {
    await integration.cleanup();
  });

  afterAll(async () => {
    await integration.cleanup();
  });

  test('partner has full access to joint accounts and their transactions', async () => {
    const owner = await integration.signUp('joint-owner');
    const partner = await integration.signUp('joint-partner');
    const stranger = await integration.signUp('joint-stranger');
    await linkPartners(owner, partner);

    const jointAccount = await createSavingsAccount(owner, { isJoint: true, balance: 1000 });
    const personalAccount = await createSavingsAccount(owner, {
      name: 'Personal',
      isJoint: false,
    });

    // Partner sees the joint account (and not the personal one) in lists.
    const partnerList = await parseJson<ApiDataResponse<Array<{ id: number }>>>(
      await integration.request('/api/savings/accounts', { cookie: partner.cookie }),
      200,
    );
    expect(partnerList.data.map((account) => account.id)).toEqual([jointAccount.id]);

    expect((await getSavingsAccount(partner, jointAccount.id)).status).toBe(200);
    expect((await getSavingsAccount(partner, personalAccount.id)).status).toBe(404);
    expect((await getSavingsAccount(stranger, jointAccount.id)).status).toBe(404);

    // Partner can edit the joint account.
    await parseJson(
      await integration.request(`/api/savings/accounts/${jointAccount.id}`, {
        method: 'PATCH',
        cookie: partner.cookie,
        json: { name: 'Renamed by partner' },
      }),
      200,
    );

    // Partner adds a deposit: the row carries the owner's userId and the
    // balance updates (regression test for the user-scoped balance helper).
    const txnBody = await parseJson<ApiDataResponse<{ id: number; userId: number }>>(
      await integration.request('/api/savings/transactions', {
        method: 'POST',
        cookie: partner.cookie,
        json: {
          accountId: jointAccount.id,
          type: 'deposit',
          amount: 500,
          date: '2026-06-01',
          note: 'Partner deposit',
        },
      }),
      201,
    );
    expect(txnBody.data.userId).toBe(owner.user.id);

    const afterDeposit = await parseJson<ApiDataResponse<{ balance: string }>>(
      await getSavingsAccount(owner, jointAccount.id),
      200,
    );
    expect(Number(afterDeposit.data.balance)).toBe(1500);

    // Both see the transaction; the partner can edit and delete it.
    const ownerTxns = await parseJson<ApiDataResponse<Array<{ id: number }>>>(
      await integration.request(`/api/savings/transactions?accountId=${jointAccount.id}`, {
        cookie: owner.cookie,
      }),
      200,
    );
    expect(ownerTxns.data.map((txn) => txn.id)).toEqual([txnBody.data.id]);

    await parseJson(
      await integration.request(`/api/savings/transactions/${txnBody.data.id}`, {
        method: 'PATCH',
        cookie: partner.cookie,
        json: { amount: 700 },
      }),
      200,
    );
    const afterEdit = await parseJson<ApiDataResponse<{ balance: string }>>(
      await getSavingsAccount(owner, jointAccount.id),
      200,
    );
    expect(Number(afterEdit.data.balance)).toBe(1700);

    await parseJson(
      await integration.request(`/api/savings/transactions/${txnBody.data.id}`, {
        method: 'DELETE',
        cookie: partner.cookie,
      }),
      200,
    );
    const afterDelete = await parseJson<ApiDataResponse<{ balance: string }>>(
      await getSavingsAccount(owner, jointAccount.id),
      200,
    );
    expect(Number(afterDelete.data.balance)).toBe(1000);

    // Partner can archive and unarchive the joint account.
    await parseJson(
      await integration.request(`/api/savings/accounts/${jointAccount.id}`, {
        method: 'DELETE',
        cookie: partner.cookie,
      }),
      200,
    );
    await parseJson(
      await integration.request(`/api/savings/accounts/${jointAccount.id}/unarchive`, {
        method: 'POST',
        cookie: partner.cookie,
      }),
      200,
    );

    // Stranger cannot touch anything.
    const strangerPatch = await integration.request(`/api/savings/accounts/${jointAccount.id}`, {
      method: 'PATCH',
      cookie: stranger.cookie,
      json: { name: 'Hacked' },
    });
    expect(strangerPatch.status).toBe(404);
  });

  test('unlink resets joint flags and revokes partner access', async () => {
    const owner = await integration.signUp('unlink-owner');
    const partner = await integration.signUp('unlink-partner');
    await linkPartners(owner, partner);

    const jointAccount = await createSavingsAccount(owner, { isJoint: true });
    await parseJson(
      await integration.request('/api/savings/transactions', {
        method: 'POST',
        cookie: partner.cookie,
        json: {
          accountId: jointAccount.id,
          type: 'deposit',
          amount: 250,
          date: '2026-06-02',
          note: 'Before unlink',
        },
      }),
      201,
    );

    await parseJson(await unlinkPartner(partner), 200);

    // Partner loses access; owner keeps the account, the flag resets, and the
    // partner-created transaction survives with the owner.
    expect((await getSavingsAccount(partner, jointAccount.id)).status).toBe(404);
    const ownerView = await parseJson<ApiDataResponse<{ isJoint: boolean; balance: string }>>(
      await getSavingsAccount(owner, jointAccount.id),
      200,
    );
    expect(ownerView.data.isJoint).toBe(false);
    expect(Number(ownerView.data.balance)).toBe(1250);

    const ownerTxns = await parseJson<ApiDataResponse<Array<{ note: string | null }>>>(
      await integration.request(`/api/savings/transactions?accountId=${jointAccount.id}`, {
        cookie: owner.cookie,
      }),
      200,
    );
    expect(ownerTxns.data.map((txn) => txn.note)).toEqual(['Before unlink']);
  });
});

describe('joint properties and mortgages', () => {
  beforeAll(async () => {
    await integration.cleanup();
  });

  afterAll(async () => {
    await integration.cleanup();
  });

  test('jointness propagates across the property-mortgage link in both directions', async () => {
    const owner = await integration.signUp('prop-owner');
    const partner = await integration.signUp('prop-partner');
    await linkPartners(owner, partner);

    // Mortgage created against a joint property inherits jointness.
    const jointProperty = await createProperty(owner, { isJoint: true });
    const mortgage = await createMortgage(owner, jointProperty.id);
    expect(mortgage.isJoint).toBe(true);

    // Partner can see and transact on both sides of the pair.
    const partnerMortgage = await parseJson<ApiDataResponse<{ id: number }>>(
      await integration.request(`/api/mortgages/${mortgage.id}`, { cookie: partner.cookie }),
      200,
    );
    expect(partnerMortgage.data.id).toBe(mortgage.id);

    const mortgageTxn = await parseJson<ApiDataResponse<{ id: number; userId: number }>>(
      await integration.request('/api/mortgages/transactions', {
        method: 'POST',
        cookie: partner.cookie,
        json: {
          mortgageId: mortgage.id,
          type: 'repayment',
          amount: 1200,
          interest: 500,
          principal: 700,
          date: '2026-06-01',
          note: 'Partner repayment',
        },
      }),
      201,
    );
    expect(mortgageTxn.data.userId).toBe(owner.user.id);

    const ownerMortgageTxns = await parseJson<ApiDataResponse<Array<{ id: number }>>>(
      await integration.request(`/api/mortgages/transactions?mortgageId=${mortgage.id}`, {
        cookie: owner.cookie,
      }),
      200,
    );
    expect(ownerMortgageTxns.data.map((txn) => txn.id)).toEqual([mortgageTxn.data.id]);

    const propertyTxn = await parseJson<ApiDataResponse<{ id: number; userId: number }>>(
      await integration.request('/api/investments/property-transactions', {
        method: 'POST',
        cookie: partner.cookie,
        json: {
          propertyId: jointProperty.id,
          type: 'valuation',
          amount: 310000,
          date: '2026-06-03',
          note: 'Partner valuation',
        },
      }),
      201,
    );
    expect(propertyTxn.data.userId).toBe(owner.user.id);

    // Un-marking the property un-marks the linked mortgage.
    await parseJson(
      await integration.request(`/api/investments/properties/${jointProperty.id}`, {
        method: 'PATCH',
        cookie: owner.cookie,
        json: { isJoint: false },
      }),
      200,
    );
    const unmarkedMortgage = await parseJson<ApiDataResponse<{ isJoint: boolean }>>(
      await integration.request(`/api/mortgages/${mortgage.id}`, { cookie: owner.cookie }),
      200,
    );
    expect(unmarkedMortgage.data.isJoint).toBe(false);

    // Marking the mortgage joint again marks the property.
    await parseJson(
      await integration.request(`/api/mortgages/${mortgage.id}`, {
        method: 'PATCH',
        cookie: owner.cookie,
        json: { isJoint: true },
      }),
      200,
    );
    const remarkedProperty = await parseJson<ApiDataResponse<{ isJoint: boolean }>>(
      await integration.request(`/api/investments/properties/${jointProperty.id}`, {
        cookie: owner.cookie,
      }),
      200,
    );
    expect(remarkedProperty.data.isJoint).toBe(true);
  });
});

describe('dashboard joint weighting', () => {
  beforeAll(async () => {
    await integration.cleanup();
  });

  afterAll(async () => {
    await integration.cleanup();
  });

  test('joint assets count at 50% in allocations for both partners', async () => {
    const alice = await integration.signUp('dash-alice');
    const ben = await integration.signUp('dash-ben');
    await linkPartners(alice, ben);

    // Alice: 1000 EUR personal + 500 EUR joint savings.
    await createSavingsAccount(alice, { name: 'Solo', balance: 1000 });
    await createSavingsAccount(alice, { name: 'Shared', balance: 500, isJoint: true });

    // Ben: joint property worth 300k with a joint mortgage of 200k.
    const property = await createProperty(ben, { isJoint: true });
    await createMortgage(ben, property.id);

    const aliceAllocations = await parseJson<
      ApiDataResponse<{ allocations: Array<{ name: string; value: number }> }>
    >(await integration.request('/api/dashboard/allocations', { cookie: alice.cookie }), 200);
    const aliceSavings = aliceAllocations.data.allocations.find((a) => a.name === 'Savings');
    const aliceEquity = aliceAllocations.data.allocations.find((a) => a.name === 'Property Equity');
    expect(aliceSavings?.value).toBe(1250);
    expect(aliceEquity?.value).toBe(50000);

    const benAllocations = await parseJson<
      ApiDataResponse<{ allocations: Array<{ name: string; value: number }> }>
    >(await integration.request('/api/dashboard/allocations', { cookie: ben.cookie }), 200);
    const benSavings = benAllocations.data.allocations.find((a) => a.name === 'Savings');
    const benEquity = benAllocations.data.allocations.find((a) => a.name === 'Property Equity');
    expect(benSavings?.value).toBe(250);
    expect(benEquity?.value).toBe(50000);
  });

  test('activity feed flags partner joint transactions with full amounts', async () => {
    const alice = await integration.signUp('feed-alice');
    const ben = await integration.signUp('feed-ben');
    await linkPartners(alice, ben);

    const jointAccount = await createSavingsAccount(alice, { isJoint: true, balance: 0 });
    const personalAccount = await createSavingsAccount(alice, { name: 'Solo', balance: 0 });
    const activityDate = new Date().toISOString().slice(0, 10);

    await parseJson(
      await integration.request('/api/savings/transactions', {
        method: 'POST',
        cookie: alice.cookie,
        json: {
          accountId: jointAccount.id,
          type: 'deposit',
          amount: 500,
          date: activityDate,
          note: 'Joint deposit',
        },
      }),
      201,
    );
    await parseJson(
      await integration.request('/api/savings/transactions', {
        method: 'POST',
        cookie: alice.cookie,
        json: {
          accountId: personalAccount.id,
          type: 'deposit',
          amount: 200,
          date: activityDate,
          note: 'Personal deposit',
        },
      }),
      201,
    );

    const benFeed = await parseJson<
      ApiDataResponse<Array<{ name: string; amount: number; isJoint: boolean }>>
    >(await integration.request('/api/dashboard/transactions', { cookie: ben.cookie }), 200);

    const jointRow = benFeed.data.find((row) => row.name === 'Joint deposit');
    expect(jointRow).toMatchObject({ isJoint: true, amount: -500 });
    expect(benFeed.data.find((row) => row.name === 'Personal deposit')).toBeUndefined();

    const aliceFeed = await parseJson<
      ApiDataResponse<Array<{ name: string; amount: number; isJoint: boolean }>>
    >(await integration.request('/api/dashboard/transactions', { cookie: alice.cookie }), 200);
    expect(aliceFeed.data.find((row) => row.name === 'Personal deposit')).toMatchObject({
      isJoint: false,
      amount: -200,
    });
  });
});

afterAll(() => {
  mock.restore();
});
