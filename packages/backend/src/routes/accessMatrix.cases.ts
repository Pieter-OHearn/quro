import type { RowIds } from '../test/accessWorld';

/**
 * The route inventory behind the access matrix. Every route the backend registers is listed
 * here, either as a case the matrix runs against each actor, or as an exemption with a reason.
 * `accessMatrix.integration.test.ts` fails when a route is in neither place.
 */

export type Req = {
  method: string;
  path: string;
  json?: unknown;
  form?: () => FormData;
};

/**
 * What a denied actor must see for an id they may not access:
 * - `not-found`: 404, the same body as for an id that does not exist.
 * - `bad-request`: 400, the same body as for an id that does not exist.
 * - `empty`: 200 with an empty collection, the same as for an id that does not exist.
 */
export type Denial = 'not-found' | 'bad-request' | 'empty';

/** A request that names a row by id. The owner succeeds; everyone else sees nothing. */
export type RowCase = {
  kind: 'row';
  route: string;
  /**
   * `joint`: an accepted partner may act on rows flagged joint (savings, properties, mortgages and
   * their transactions). `owner`: only the owner, whatever the row's flags.
   */
  scope: 'joint' | 'owner';
  build: (rows: RowIds) => Req;
  denied?: Denial;
  /** The request removes or changes the row for good, so each success runs on fresh rows. */
  consumes?: true;
};

/** The owner's own row pointed at a parent that belongs to someone else. */
export type CrossCase = {
  kind: 'cross';
  route: string;
  build: (own: RowIds, foreign: RowIds) => Req;
  denied?: Denial;
};

/** A collection endpoint: each actor sees their own rows and nothing of anyone else's. */
export type ListCase = {
  kind: 'list';
  route: string;
  /** Whether an accepted partner is expected to see joint rows in this collection. */
  scope: 'joint' | 'owner';
  build: () => Req;
};

/** A write that takes no id: ownership comes from the session, never from the body. */
export type CallerCase = {
  kind: 'caller';
  route: string;
  /** The victim's user id is sent as every ownership field the payload might honour. */
  build: (victimId: number, victimRows: RowIds) => Req;
};

export type AccessCase = RowCase | CrossCase | ListCase | CallerCase;

const PDF = () =>
  new File(
    [Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<<>>\n%%EOF\n')],
    'synthetic.pdf',
    { type: 'application/pdf' },
  );

function pdfForm(extra: Record<string, string> = {}) {
  return () => {
    const form = new FormData();
    form.set('file', PDF());
    for (const [key, value] of Object.entries(extra)) form.set(key, value);
    return form;
  };
}

const get = (path: string): Req => ({ method: 'GET', path });
const send = (method: string, path: string, json?: unknown): Req => ({ method, path, json });

export const ACCESS_CASES: AccessCase[] = [
  // ── Savings ────────────────────────────────────────────────────────────────
  {
    kind: 'list',
    route: 'GET /api/savings/accounts',
    scope: 'joint',
    build: () => get('/api/savings/accounts?includeArchived=true'),
  },
  {
    kind: 'row',
    route: 'GET /api/savings/accounts/:id',
    scope: 'joint',
    build: (r) => get(`/api/savings/accounts/${r.savingsAccount}`),
  },
  {
    kind: 'caller',
    route: 'POST /api/savings/accounts',
    build: (victim) =>
      send('POST', '/api/savings/accounts', {
        userId: victim,
        name: 'Forged owner',
        bank: 'Synthetic',
        balance: 1,
        currency: 'EUR',
        interestRate: 1,
        accountType: 'Savings',
      }),
  },
  {
    kind: 'row',
    route: 'PATCH /api/savings/accounts/:id',
    scope: 'joint',
    build: (r) => send('PATCH', `/api/savings/accounts/${r.savingsAccount}`, { name: 'Renamed' }),
  },
  {
    kind: 'row',
    route: 'PATCH /api/savings/accounts/:id/banking-entity',
    scope: 'joint',
    build: (r) =>
      send('PATCH', `/api/savings/accounts/${r.savingsAccount}/banking-entity`, { mode: 'clear' }),
  },
  {
    kind: 'row',
    route: 'DELETE /api/savings/accounts/:id',
    scope: 'joint',
    consumes: true,
    build: (r) => send('DELETE', `/api/savings/accounts/${r.savingsAccount}`),
  },
  {
    kind: 'row',
    route: 'POST /api/savings/accounts/:id/unarchive',
    scope: 'joint',
    build: (r) => send('POST', `/api/savings/accounts/${r.savingsAccount}/unarchive`),
  },
  {
    kind: 'row',
    route: 'GET /api/savings/transactions',
    scope: 'joint',
    build: (r) => get(`/api/savings/transactions?accountId=${r.savingsAccount}`),
  },
  {
    kind: 'list',
    route: 'GET /api/savings/transactions',
    scope: 'joint',
    build: () => get('/api/savings/transactions'),
  },
  {
    kind: 'row',
    route: 'GET /api/savings/transactions/:id',
    scope: 'joint',
    build: (r) => get(`/api/savings/transactions/${r.savingsTxn}`),
  },
  {
    kind: 'row',
    route: 'POST /api/savings/transactions',
    scope: 'joint',
    build: (r) =>
      send('POST', '/api/savings/transactions', {
        accountId: r.savingsAccount,
        type: 'deposit',
        amount: 5,
        date: '2026-03-02',
      }),
  },
  {
    kind: 'row',
    route: 'PATCH /api/savings/transactions/:id',
    scope: 'joint',
    build: (r) => send('PATCH', `/api/savings/transactions/${r.savingsTxn}`, { note: 'Edited' }),
  },
  {
    kind: 'cross',
    route: 'PATCH /api/savings/transactions/:id',
    build: (own, foreign) =>
      send('PATCH', `/api/savings/transactions/${own.savingsTxn}`, {
        accountId: foreign.savingsAccount,
      }),
  },
  {
    kind: 'row',
    route: 'DELETE /api/savings/transactions/:id',
    scope: 'joint',
    consumes: true,
    build: (r) => send('DELETE', `/api/savings/transactions/${r.savingsTxn}`),
  },

  // ── Investments: holdings (not shareable) ──────────────────────────────────
  {
    kind: 'list',
    route: 'GET /api/investments/holdings',
    scope: 'owner',
    build: () => get('/api/investments/holdings?includeArchived=true'),
  },
  {
    kind: 'row',
    route: 'GET /api/investments/holdings/:id',
    scope: 'owner',
    build: (r) => get(`/api/investments/holdings/${r.holding}`),
  },
  {
    kind: 'caller',
    route: 'POST /api/investments/holdings',
    build: (victim) =>
      send('POST', '/api/investments/holdings', {
        userId: victim,
        name: 'Forged holding',
        ticker: 'FRG',
        currentPrice: 1,
        currency: 'EUR',
        sector: 'Test',
      }),
  },
  {
    kind: 'row',
    route: 'PATCH /api/investments/holdings/:id',
    scope: 'owner',
    build: (r) => send('PATCH', `/api/investments/holdings/${r.holding}`, { name: 'Renamed' }),
  },
  {
    kind: 'row',
    route: 'DELETE /api/investments/holdings/:id',
    scope: 'owner',
    consumes: true,
    build: (r) => send('DELETE', `/api/investments/holdings/${r.holding}`),
  },
  {
    kind: 'row',
    route: 'POST /api/investments/holdings/:id/unarchive',
    scope: 'owner',
    build: (r) => send('POST', `/api/investments/holdings/${r.holding}/unarchive`),
  },
  {
    kind: 'list',
    route: 'GET /api/investments/holding-price-history',
    scope: 'owner',
    build: () => get('/api/investments/holding-price-history?from=2000-01-01'),
  },
  {
    kind: 'row',
    route: 'GET /api/investments/holding-price-history',
    scope: 'owner',
    denied: 'empty',
    build: (r) =>
      get(`/api/investments/holding-price-history?holdingIds=${r.holding}&from=2000-01-01`),
  },
  {
    kind: 'row',
    route: 'POST /api/investments/holdings/sync-prices',
    scope: 'owner',
    denied: 'empty',
    build: (r) =>
      send('POST', '/api/investments/holdings/sync-prices', { holdingIds: [r.holding] }),
  },
  {
    kind: 'row',
    route: 'POST /api/investments/holdings/:id/refresh-price',
    scope: 'owner',
    build: (r) => send('POST', `/api/investments/holdings/${r.holding}/refresh-price`),
  },
  {
    kind: 'list',
    route: 'GET /api/investments/holding-transactions',
    scope: 'owner',
    build: () => get('/api/investments/holding-transactions'),
  },
  {
    kind: 'row',
    route: 'GET /api/investments/holding-transactions',
    scope: 'owner',
    denied: 'empty',
    build: (r) => get(`/api/investments/holding-transactions?holdingId=${r.holding}`),
  },
  {
    kind: 'row',
    route: 'GET /api/investments/holding-transactions/:id',
    scope: 'owner',
    build: (r) => get(`/api/investments/holding-transactions/${r.holdingTxn}`),
  },
  {
    kind: 'row',
    route: 'POST /api/investments/holding-transactions',
    scope: 'owner',
    build: (r) =>
      send('POST', '/api/investments/holding-transactions', {
        holdingId: r.holding,
        type: 'buy',
        shares: 1,
        price: 10,
        date: '2026-03-02',
      }),
  },
  {
    kind: 'row',
    route: 'PATCH /api/investments/holding-transactions/:id',
    scope: 'owner',
    build: (r) =>
      send('PATCH', `/api/investments/holding-transactions/${r.holdingTxn}`, { note: 'Edited' }),
  },
  {
    kind: 'cross',
    route: 'PATCH /api/investments/holding-transactions/:id',
    build: (own, foreign) =>
      send('PATCH', `/api/investments/holding-transactions/${own.holdingTxn}`, {
        holdingId: foreign.holding,
      }),
  },
  {
    kind: 'row',
    route: 'DELETE /api/investments/holding-transactions/:id',
    scope: 'owner',
    consumes: true,
    build: (r) => send('DELETE', `/api/investments/holding-transactions/${r.holdingTxn}`),
  },

  // ── Investments: properties ────────────────────────────────────────────────
  {
    kind: 'list',
    route: 'GET /api/investments/properties',
    scope: 'joint',
    build: () => get('/api/investments/properties?includeArchived=true'),
  },
  {
    kind: 'row',
    route: 'GET /api/investments/properties/:id',
    scope: 'joint',
    build: (r) => get(`/api/investments/properties/${r.property}`),
  },
  {
    kind: 'caller',
    route: 'POST /api/investments/properties',
    build: (victim) =>
      send('POST', '/api/investments/properties', {
        userId: victim,
        address: 'Forged property',
        propertyType: 'primary_home',
        purchasePrice: 1000,
        currentValue: 1000,
        monthlyRent: 0,
        currency: 'EUR',
      }),
  },
  {
    kind: 'row',
    route: 'PATCH /api/investments/properties/:id',
    scope: 'joint',
    build: (r) =>
      send('PATCH', `/api/investments/properties/${r.property}`, { address: 'Renamed' }),
  },
  {
    kind: 'cross',
    route: 'PATCH /api/investments/properties/:id',
    build: (own, foreign) =>
      send('PATCH', `/api/investments/properties/${own.property}`, {
        mortgageId: foreign.mortgage,
      }),
  },
  {
    kind: 'row',
    route: 'DELETE /api/investments/properties/:id',
    scope: 'joint',
    consumes: true,
    build: (r) => send('DELETE', `/api/investments/properties/${r.property}`),
  },
  {
    kind: 'row',
    route: 'POST /api/investments/properties/:id/unarchive',
    scope: 'joint',
    build: (r) => send('POST', `/api/investments/properties/${r.property}/unarchive`),
  },
  {
    kind: 'row',
    route: 'GET /api/investments/property-transactions',
    scope: 'joint',
    build: (r) => get(`/api/investments/property-transactions?propertyId=${r.property}`),
  },
  {
    kind: 'list',
    route: 'GET /api/investments/property-transactions',
    scope: 'joint',
    build: () => get('/api/investments/property-transactions'),
  },
  {
    kind: 'row',
    route: 'GET /api/investments/property-transactions/:id',
    scope: 'joint',
    build: (r) => get(`/api/investments/property-transactions/${r.propertyTxn}`),
  },
  {
    kind: 'row',
    route: 'POST /api/investments/property-transactions',
    scope: 'joint',
    build: (r) =>
      send('POST', '/api/investments/property-transactions', {
        propertyId: r.property,
        type: 'valuation',
        amount: 255000,
        date: '2026-03-02',
      }),
  },
  {
    kind: 'row',
    route: 'PATCH /api/investments/property-transactions/:id',
    scope: 'joint',
    build: (r) =>
      send('PATCH', `/api/investments/property-transactions/${r.propertyTxn}`, { note: 'Edited' }),
  },
  {
    kind: 'cross',
    route: 'PATCH /api/investments/property-transactions/:id',
    build: (own, foreign) =>
      send('PATCH', `/api/investments/property-transactions/${own.propertyTxn}`, {
        propertyId: foreign.property,
      }),
  },
  {
    kind: 'row',
    route: 'DELETE /api/investments/property-transactions/:id',
    scope: 'joint',
    consumes: true,
    build: (r) => send('DELETE', `/api/investments/property-transactions/${r.propertyTxn}`),
  },

  // ── Mortgages ──────────────────────────────────────────────────────────────
  {
    kind: 'list',
    route: 'GET /api/mortgages',
    scope: 'joint',
    build: () => get('/api/mortgages?includeArchived=true'),
  },
  {
    kind: 'row',
    route: 'GET /api/mortgages/:id',
    scope: 'joint',
    build: (r) => get(`/api/mortgages/${r.mortgage}`),
  },
  {
    kind: 'row',
    route: 'POST /api/mortgages',
    scope: 'joint',
    consumes: true,
    build: (r) =>
      send('POST', '/api/mortgages', {
        linkedPropertyId: r.property,
        lender: 'Synthetic Bank',
        originalAmount: 100000,
        outstandingBalance: 90000,
        monthlyPayment: 500,
        interestRate: 3,
        rateType: 'fixed',
        repaymentType: 'annuity',
        fixedUntil: '2031-06-30',
        termYears: 30,
        startDate: '2021-07-01',
        endDate: '2051-07-01',
      }),
  },
  {
    kind: 'row',
    route: 'PATCH /api/mortgages/:id',
    scope: 'joint',
    build: (r) =>
      send('PATCH', `/api/mortgages/${r.mortgage}`, {
        linkedPropertyId: r.linkedProperty,
        lender: 'Renamed Bank',
      }),
  },
  {
    kind: 'cross',
    route: 'PATCH /api/mortgages/:id',
    build: (own, foreign) =>
      send('PATCH', `/api/mortgages/${own.mortgage}`, { linkedPropertyId: foreign.linkedProperty }),
  },
  {
    kind: 'row',
    route: 'DELETE /api/mortgages/:id',
    scope: 'joint',
    consumes: true,
    build: (r) => send('DELETE', `/api/mortgages/${r.mortgage}`),
  },
  {
    kind: 'row',
    route: 'POST /api/mortgages/:id/unarchive',
    scope: 'joint',
    build: (r) => send('POST', `/api/mortgages/${r.mortgage}/unarchive`),
  },
  {
    kind: 'row',
    route: 'GET /api/mortgages/transactions',
    scope: 'joint',
    build: (r) => get(`/api/mortgages/transactions?mortgageId=${r.mortgage}`),
  },
  {
    kind: 'list',
    route: 'GET /api/mortgages/transactions',
    scope: 'joint',
    build: () => get('/api/mortgages/transactions'),
  },
  {
    kind: 'row',
    route: 'GET /api/mortgages/transactions/:id',
    scope: 'joint',
    build: (r) => get(`/api/mortgages/transactions/${r.mortgageTxn}`),
  },
  {
    kind: 'row',
    route: 'POST /api/mortgages/transactions',
    scope: 'joint',
    build: (r) =>
      send('POST', '/api/mortgages/transactions', {
        mortgageId: r.mortgage,
        type: 'repayment',
        amount: 1000,
        interest: 200,
        principal: 800,
        date: '2026-03-02',
      }),
  },
  {
    kind: 'row',
    route: 'PATCH /api/mortgages/transactions/:id',
    scope: 'joint',
    build: (r) => send('PATCH', `/api/mortgages/transactions/${r.mortgageTxn}`, { note: 'Edited' }),
  },
  {
    kind: 'cross',
    route: 'PATCH /api/mortgages/transactions/:id',
    build: (own, foreign) =>
      send('PATCH', `/api/mortgages/transactions/${own.mortgageTxn}`, {
        mortgageId: foreign.mortgage,
      }),
  },
  {
    kind: 'row',
    route: 'DELETE /api/mortgages/transactions/:id',
    scope: 'joint',
    consumes: true,
    build: (r) => send('DELETE', `/api/mortgages/transactions/${r.mortgageTxn}`),
  },

  // ── Pensions ───────────────────────────────────────────────────────────────
  {
    kind: 'list',
    route: 'GET /api/pensions/pots',
    scope: 'owner',
    build: () => get('/api/pensions/pots?includeArchived=true'),
  },
  {
    kind: 'row',
    route: 'GET /api/pensions/pots/:id',
    scope: 'owner',
    build: (r) => get(`/api/pensions/pots/${r.pensionPot}`),
  },
  {
    kind: 'caller',
    route: 'POST /api/pensions/pots',
    build: (victim) =>
      send('POST', '/api/pensions/pots', {
        userId: victim,
        name: 'Forged pot',
        provider: 'Synthetic',
        type: 'Personal Pension',
        balance: 1,
        currency: 'EUR',
        employeeMonthly: 0,
        employerMonthly: 0,
      }),
  },
  {
    kind: 'row',
    route: 'PATCH /api/pensions/pots/:id',
    scope: 'owner',
    build: (r) => send('PATCH', `/api/pensions/pots/${r.pensionPot}`, { name: 'Renamed' }),
  },
  {
    kind: 'row',
    route: 'DELETE /api/pensions/pots/:id',
    scope: 'owner',
    consumes: true,
    build: (r) => send('DELETE', `/api/pensions/pots/${r.pensionPot}`),
  },
  {
    kind: 'row',
    route: 'POST /api/pensions/pots/:id/unarchive',
    scope: 'owner',
    build: (r) => send('POST', `/api/pensions/pots/${r.pensionPot}/unarchive`),
  },
  {
    kind: 'list',
    route: 'GET /api/pensions/transactions',
    scope: 'owner',
    build: () => get('/api/pensions/transactions'),
  },
  {
    kind: 'row',
    route: 'GET /api/pensions/transactions',
    scope: 'owner',
    denied: 'empty',
    build: (r) => get(`/api/pensions/transactions?potId=${r.pensionPot}`),
  },
  {
    kind: 'row',
    route: 'GET /api/pensions/transactions/:id',
    scope: 'owner',
    build: (r) => get(`/api/pensions/transactions/${r.pensionTxn}`),
  },
  {
    kind: 'row',
    route: 'POST /api/pensions/transactions',
    scope: 'owner',
    build: (r) =>
      send('POST', '/api/pensions/transactions', {
        potId: r.pensionPot,
        type: 'fee',
        amount: 5,
        date: '2026-03-02',
      }),
  },
  {
    kind: 'row',
    route: 'PATCH /api/pensions/transactions/:id',
    scope: 'owner',
    build: (r) => send('PATCH', `/api/pensions/transactions/${r.pensionTxn}`, { note: 'Edited' }),
  },
  {
    kind: 'cross',
    route: 'PATCH /api/pensions/transactions/:id',
    build: (own, foreign) =>
      send('PATCH', `/api/pensions/transactions/${own.pensionTxn}`, { potId: foreign.pensionPot }),
  },
  {
    kind: 'row',
    route: 'DELETE /api/pensions/transactions/:id',
    scope: 'owner',
    consumes: true,
    build: (r) => send('DELETE', `/api/pensions/transactions/${r.pensionTxn}`),
  },
  {
    kind: 'list',
    route: 'GET /api/pensions/documents',
    scope: 'owner',
    build: () => get('/api/pensions/documents'),
  },
  {
    kind: 'row',
    route: 'GET /api/pensions/documents',
    scope: 'owner',
    denied: 'empty',
    build: (r) => get(`/api/pensions/documents?potId=${r.pensionPot}`),
  },
  {
    kind: 'row',
    route: 'POST /api/pensions/transactions/:id/document',
    scope: 'owner',
    build: (r) => ({
      method: 'POST',
      path: `/api/pensions/transactions/${r.pensionTxn}/document`,
      form: pdfForm(),
    }),
  },
  {
    kind: 'row',
    route: 'GET /api/pensions/transactions/:id/document/download',
    scope: 'owner',
    build: (r) => get(`/api/pensions/transactions/${r.pensionTxn}/document/download`),
  },
  {
    kind: 'row',
    route: 'DELETE /api/pensions/transactions/:id/document',
    scope: 'owner',
    consumes: true,
    build: (r) => send('DELETE', `/api/pensions/transactions/${r.pensionTxn}/document`),
  },

  // ── Pension statement imports (queued jobs) ────────────────────────────────
  {
    kind: 'list',
    route: 'GET /api/pensions/imports',
    scope: 'owner',
    build: () => get('/api/pensions/imports?statuses=queued,processing,ready_for_review,failed'),
  },
  {
    kind: 'row',
    route: 'POST /api/pensions/imports',
    scope: 'owner',
    build: (r) => ({
      method: 'POST',
      path: '/api/pensions/imports',
      form: pdfForm({ potId: String(r.pensionPot) }),
    }),
  },
  {
    kind: 'row',
    route: 'GET /api/pensions/imports/:id',
    scope: 'owner',
    build: (r) => get(`/api/pensions/imports/${r.pensionImport}`),
  },
  {
    kind: 'row',
    route: 'GET /api/pensions/imports/:id/rows',
    scope: 'owner',
    build: (r) => get(`/api/pensions/imports/${r.pensionImport}/rows`),
  },
  {
    kind: 'row',
    route: 'PATCH /api/pensions/imports/:id/rows/:rowId',
    scope: 'owner',
    build: (r) =>
      send('PATCH', `/api/pensions/imports/${r.pensionImport}/rows/${r.pensionImportRow}`, {
        note: 'Edited',
      }),
  },
  {
    kind: 'row',
    route: 'DELETE /api/pensions/imports/:id/rows/:rowId',
    scope: 'owner',
    consumes: true,
    build: (r) =>
      send('DELETE', `/api/pensions/imports/${r.pensionImport}/rows/${r.pensionImportRow}`),
  },
  {
    kind: 'row',
    route: 'POST /api/pensions/imports/:id/rows/:rowId/restore',
    scope: 'owner',
    build: (r) =>
      send('POST', `/api/pensions/imports/${r.pensionImport}/rows/${r.pensionImportRow}/restore`),
  },
  {
    kind: 'row',
    route: 'POST /api/pensions/imports/:id/commit',
    scope: 'owner',
    consumes: true,
    build: (r) => send('POST', `/api/pensions/imports/${r.pensionImport}/commit`),
  },
  {
    kind: 'row',
    route: 'DELETE /api/pensions/imports/:id',
    scope: 'owner',
    consumes: true,
    build: (r) => send('DELETE', `/api/pensions/imports/${r.pensionImport}`),
  },

  // ── Debts ──────────────────────────────────────────────────────────────────
  {
    kind: 'list',
    route: 'GET /api/debts',
    scope: 'owner',
    build: () => get('/api/debts?includeArchived=true'),
  },
  {
    kind: 'row',
    route: 'GET /api/debts/:id',
    scope: 'owner',
    build: (r) => get(`/api/debts/${r.debt}`),
  },
  {
    kind: 'caller',
    route: 'POST /api/debts',
    build: (victim) =>
      send('POST', '/api/debts', {
        userId: victim,
        name: 'Forged debt',
        type: 'credit_card',
        lender: 'Synthetic',
        originalAmount: 100,
        remainingBalance: 100,
        currency: 'EUR',
        interestRate: 5,
        monthlyPayment: 10,
        startDate: '2026-01-01',
        color: '#ef4444',
        emoji: 'D',
      }),
  },
  {
    kind: 'row',
    route: 'PATCH /api/debts/:id',
    scope: 'owner',
    build: (r) => send('PATCH', `/api/debts/${r.debt}`, { name: 'Renamed' }),
  },
  {
    kind: 'row',
    route: 'DELETE /api/debts/:id',
    scope: 'owner',
    consumes: true,
    build: (r) => send('DELETE', `/api/debts/${r.debt}`),
  },
  {
    kind: 'row',
    route: 'POST /api/debts/:id/unarchive',
    scope: 'owner',
    build: (r) => send('POST', `/api/debts/${r.debt}/unarchive`),
  },
  {
    kind: 'list',
    route: 'GET /api/debts/payments',
    scope: 'owner',
    build: () => get('/api/debts/payments'),
  },
  {
    kind: 'row',
    route: 'GET /api/debts/payments',
    scope: 'owner',
    build: (r) => get(`/api/debts/payments?debtId=${r.debt}`),
  },
  {
    kind: 'row',
    route: 'POST /api/debts/payments',
    scope: 'owner',
    build: (r) =>
      send('POST', '/api/debts/payments', {
        debtId: r.debt,
        amount: 50,
        interest: 5,
        date: '2026-03-02',
      }),
  },
  {
    kind: 'row',
    route: 'DELETE /api/debts/payments/:id',
    scope: 'owner',
    consumes: true,
    build: (r) => send('DELETE', `/api/debts/payments/${r.debtPayment}`),
  },

  // ── Salary and employments ─────────────────────────────────────────────────
  {
    kind: 'list',
    route: 'GET /api/salary/payslips',
    scope: 'owner',
    build: () => get('/api/salary/payslips'),
  },
  {
    kind: 'row',
    route: 'GET /api/salary/payslips/:id',
    scope: 'owner',
    build: (r) => get(`/api/salary/payslips/${r.payslip}`),
  },
  {
    kind: 'caller',
    route: 'POST /api/salary/payslips',
    build: (victim, rows) =>
      send('POST', '/api/salary/payslips', {
        userId: victim,
        employmentId: rows.employment,
        month: 'April 2026',
        date: '2026-04-30',
        gross: 1,
        tax: 0,
        pension: 0,
        net: 1,
        currency: 'EUR',
      }),
  },
  {
    kind: 'row',
    route: 'PATCH /api/salary/payslips/:id',
    scope: 'owner',
    build: (r) => send('PATCH', `/api/salary/payslips/${r.payslip}`, { bonus: 10 }),
  },
  {
    kind: 'cross',
    route: 'PATCH /api/salary/payslips/:id',
    denied: 'bad-request',
    build: (own, foreign) =>
      send('PATCH', `/api/salary/payslips/${own.payslip}`, { employmentId: foreign.employment }),
  },
  {
    kind: 'row',
    route: 'DELETE /api/salary/payslips/:id',
    scope: 'owner',
    consumes: true,
    build: (r) => send('DELETE', `/api/salary/payslips/${r.payslip}`),
  },
  {
    kind: 'row',
    route: 'POST /api/salary/payslips/:id/document',
    scope: 'owner',
    build: (r) => ({
      method: 'POST',
      path: `/api/salary/payslips/${r.payslip}/document`,
      form: pdfForm(),
    }),
  },
  {
    kind: 'row',
    route: 'GET /api/salary/payslips/:id/document/download',
    scope: 'owner',
    build: (r) => get(`/api/salary/payslips/${r.payslip}/document/download`),
  },
  {
    kind: 'row',
    route: 'DELETE /api/salary/payslips/:id/document',
    scope: 'owner',
    consumes: true,
    build: (r) => send('DELETE', `/api/salary/payslips/${r.payslip}/document`),
  },
  {
    kind: 'list',
    route: 'GET /api/salary/history',
    scope: 'owner',
    build: () => get('/api/salary/history'),
  },
  {
    kind: 'list',
    route: 'GET /api/employments',
    scope: 'owner',
    build: () => get('/api/employments'),
  },
  {
    kind: 'caller',
    route: 'POST /api/employments',
    build: (victim) =>
      send('POST', '/api/employments', {
        userId: victim,
        employerName: 'Forged employer',
        employmentType: 'employed',
        serviceStartDate: '2020-01-01',
      }),
  },
  {
    kind: 'row',
    route: 'PATCH /api/employments/:id',
    scope: 'owner',
    build: (r) => send('PATCH', `/api/employments/${r.employment}`, { employerName: 'Renamed' }),
  },
  {
    kind: 'row',
    route: 'DELETE /api/employments/:id',
    scope: 'owner',
    consumes: true,
    build: (r) => send('DELETE', `/api/employments/${r.employment}`),
  },

  // ── Goals ──────────────────────────────────────────────────────────────────
  { kind: 'list', route: 'GET /api/goals', scope: 'owner', build: () => get('/api/goals') },
  {
    kind: 'row',
    route: 'GET /api/goals/:id',
    scope: 'owner',
    build: (r) => get(`/api/goals/${r.goal}`),
  },
  {
    kind: 'caller',
    route: 'POST /api/goals',
    build: (victim) =>
      send('POST', '/api/goals', {
        userId: victim,
        type: 'annual',
        name: 'Forged goal',
        currentAmount: 0,
        targetAmount: 10,
        deadline: '2026-12-31',
        year: 2026,
        category: 'Personal',
        monthlyContribution: 0,
        currency: 'EUR',
      }),
  },
  {
    kind: 'cross',
    route: 'POST /api/goals',
    denied: 'bad-request',
    build: (_own, foreign) =>
      send('POST', '/api/goals', {
        type: 'annual',
        name: 'Linked goal',
        sourceType: 'savings_account',
        sourceId: foreign.savingsAccount,
        currentAmount: 0,
        targetAmount: 10,
        deadline: '2026-12-31',
        year: 2026,
        category: 'Personal',
        monthlyContribution: 0,
        currency: 'EUR',
      }),
  },
  {
    kind: 'row',
    route: 'PATCH /api/goals/:id',
    scope: 'owner',
    build: (r) => send('PATCH', `/api/goals/${r.goal}`, { name: 'Renamed' }),
  },
  {
    kind: 'row',
    route: 'DELETE /api/goals/:id',
    scope: 'owner',
    consumes: true,
    build: (r) => send('DELETE', `/api/goals/${r.goal}`),
  },

  // ── Budget ─────────────────────────────────────────────────────────────────
  {
    kind: 'list',
    route: 'GET /api/budget/categories',
    scope: 'owner',
    build: () => get('/api/budget/categories'),
  },
  {
    kind: 'row',
    route: 'GET /api/budget/categories/:id',
    scope: 'owner',
    build: (r) => get(`/api/budget/categories/${r.budgetCategory}`),
  },
  {
    kind: 'caller',
    route: 'POST /api/budget/categories',
    build: (victim) =>
      send('POST', '/api/budget/categories', {
        userId: victim,
        name: 'Forged category',
        budgeted: 10,
        spent: 0,
        month: 'Apr',
        year: 2026,
      }),
  },
  {
    kind: 'row',
    route: 'PATCH /api/budget/categories/:id',
    scope: 'owner',
    build: (r) => send('PATCH', `/api/budget/categories/${r.budgetCategory}`, { name: 'Renamed' }),
  },
  {
    kind: 'row',
    route: 'PATCH /api/budget/categories/classify',
    scope: 'owner',
    build: (r) =>
      send('PATCH', '/api/budget/categories/classify', {
        updates: [{ id: r.budgetCategory, expenseClass: 'discretionary' }],
      }),
  },
  {
    kind: 'row',
    route: 'DELETE /api/budget/categories/:id',
    scope: 'owner',
    consumes: true,
    build: (r) => send('DELETE', `/api/budget/categories/${r.emptyBudgetCategory}`),
  },
  {
    kind: 'list',
    route: 'GET /api/budget/transactions',
    scope: 'owner',
    build: () => get('/api/budget/transactions'),
  },
  {
    kind: 'row',
    route: 'GET /api/budget/transactions',
    scope: 'owner',
    denied: 'empty',
    build: (r) => get(`/api/budget/transactions?categoryId=${r.budgetCategory}`),
  },
  {
    kind: 'row',
    route: 'GET /api/budget/transactions/:id',
    scope: 'owner',
    build: (r) => get(`/api/budget/transactions/${r.budgetTxn}`),
  },
  {
    kind: 'row',
    route: 'POST /api/budget/transactions',
    scope: 'owner',
    build: (r) =>
      send('POST', '/api/budget/transactions', {
        categoryId: r.budgetCategory,
        description: 'Synthetic',
        amount: 5,
        date: '2026-03-02',
        merchant: 'Synthetic',
      }),
  },
  {
    kind: 'row',
    route: 'PATCH /api/budget/transactions/:id',
    scope: 'owner',
    build: (r) =>
      send('PATCH', `/api/budget/transactions/${r.budgetTxn}`, { description: 'Edited' }),
  },
  {
    kind: 'cross',
    route: 'PATCH /api/budget/transactions/:id',
    build: (own, foreign) =>
      send('PATCH', `/api/budget/transactions/${own.budgetTxn}`, {
        categoryId: foreign.budgetCategory,
      }),
  },
  {
    kind: 'row',
    route: 'DELETE /api/budget/transactions/:id',
    scope: 'owner',
    consumes: true,
    build: (r) => send('DELETE', `/api/budget/transactions/${r.budgetTxn}`),
  },
  {
    kind: 'list',
    route: 'GET /api/budget/category-mappings',
    scope: 'owner',
    build: () => get('/api/budget/category-mappings'),
  },
  {
    kind: 'row',
    route: 'PATCH /api/budget/category-mappings/:id',
    scope: 'owner',
    build: (r) =>
      send('PATCH', `/api/budget/category-mappings/${r.categoryMapping}`, {
        categoryName: 'Renamed',
      }),
  },

  // ── Aggregates, planning and the caller's own settings ─────────────────────
  {
    kind: 'list',
    route: 'GET /api/dashboard/summary',
    scope: 'joint',
    build: () => get('/api/dashboard/summary'),
  },
  {
    kind: 'list',
    route: 'GET /api/dashboard/net-worth',
    scope: 'joint',
    build: () => get('/api/dashboard/net-worth'),
  },
  {
    kind: 'list',
    route: 'GET /api/dashboard/allocations',
    scope: 'joint',
    build: () => get('/api/dashboard/allocations'),
  },
  {
    kind: 'list',
    route: 'GET /api/dashboard/insights',
    scope: 'owner',
    build: () => get('/api/dashboard/insights?year=2026'),
  },
  {
    kind: 'list',
    route: 'GET /api/dashboard/transactions',
    scope: 'joint',
    build: () => get('/api/dashboard/transactions'),
  },
  {
    kind: 'list',
    route: 'GET /api/plan/runway',
    scope: 'joint',
    build: () => get('/api/plan/runway'),
  },
  {
    kind: 'list',
    route: 'GET /api/plan/assumptions',
    scope: 'owner',
    build: () => get('/api/plan/assumptions'),
  },
  {
    kind: 'caller',
    route: 'PUT /api/plan/assumptions',
    build: (victim) =>
      send('PUT', '/api/plan/assumptions', { userId: victim, leanBurnOverride: 4321 }),
  },
  { kind: 'list', route: 'GET /api/settings', scope: 'owner', build: () => get('/api/settings') },
  {
    kind: 'caller',
    route: 'PUT /api/settings/preferences',
    build: (victim) =>
      send('PUT', '/api/settings/preferences', { id: victim, userId: victim, baseCurrency: 'GBP' }),
  },
  {
    kind: 'caller',
    route: 'PUT /api/settings/profile',
    build: (victim) =>
      send('PUT', '/api/settings/profile', {
        id: victim,
        userId: victim,
        firstName: 'Forged',
        lastName: 'Profile',
        email: `forged-${victim}@s04-access.integration.quro.test`,
        location: '',
        age: 40,
        retirementAge: 67,
      }),
  },
  {
    kind: 'list',
    route: 'GET /api/settings/sessions',
    scope: 'owner',
    build: () => get('/api/settings/sessions'),
  },
  {
    kind: 'row',
    route: 'DELETE /api/settings/sessions/:id',
    scope: 'owner',
    consumes: true,
    build: (r) => send('DELETE', `/api/settings/sessions/${r.extraSession}`),
  },
  {
    kind: 'list',
    route: 'GET /api/bunq/connection',
    scope: 'owner',
    build: () => get('/api/bunq/connection'),
  },
];

/** Routes the matrix does not run per actor, and why. Anonymous access is still checked for all. */
export const EXEMPT_ROUTES: Record<string, string> = {
  'GET /api/health': 'public by design; reports no household data',
  'GET /api/readiness': 'public by design; reports service readiness only',
  'GET /api/readiness/pension-import': 'public by design; reports parser readiness only',
  'GET /api/auth/registration': 'public by design; covered by authAccess.integration.test.ts',
  'POST /api/auth/signup': 'public; covered by authAccess and the dynamic deployment tests',
  'POST /api/auth/signin': 'public; covered by authAccess and the dynamic deployment tests',
  'POST /api/auth/password-reset': 'public; covered by authAccess.integration.test.ts',
  'GET /api/auth/me': 'returns only the caller; covered by the session lifecycle tests',
  'POST /api/auth/signout': 'ends only the caller session; covered by the session lifecycle tests',
  'GET /api/savings/banking-entities': 'static reference data, no household data',
  'GET /api/currency/rates': 'shared exchange-rate cache, no household data',
  'GET /api/capabilities': 'instance capabilities, no household data',
  'GET /api/investments/ticker-lookup/:symbol': 'market-data proxy; no household data',
  'PUT /api/settings/password': 'acts on the caller; covered by the session lifecycle tests',
  'DELETE /api/settings/sessions':
    'revokes only the caller own other sessions; session lifecycle tests',
  'GET /api/partner': 'returns only the caller link; covered by the partner lifecycle tests',
  'POST /api/partner/invite': 'covered by the partner lifecycle tests',
  'POST /api/partner/accept': 'covered by the partner lifecycle tests',
  'POST /api/partner/decline': 'covered by the partner lifecycle tests',
  'DELETE /api/partner': 'covered by the partner lifecycle tests',
  'GET /api/bunq/oauth/start':
    'redirects the caller to the provider; covered by bunq.integration.test.ts',
  'GET /api/bunq/oauth/callback':
    'public by design, bound to a server-recorded attempt; bunq.integration.test.ts',
  'DELETE /api/bunq/connection':
    'acts on the caller own connection, no id; covered by bunq.integration.test.ts',
  'POST /api/bunq/sync/savings':
    'acts on the caller own connection and calls the provider; bunq.integration.test.ts',
  'POST /api/bunq/sync/budget':
    'acts on the caller own connection and calls the provider; bunq.integration.test.ts',
  'POST /api/bunq/sync':
    'acts on the caller own connection and calls the provider; bunq.integration.test.ts',
};
