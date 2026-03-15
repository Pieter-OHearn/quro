import { afterAll, beforeAll, describe, expect, mock, test } from 'bun:test';

const s3Objects = new Map<string, Uint8Array>();

type QuoteFixture = {
  close: number | null;
  priceCurrency: string | null;
  eodDate: string | null;
  tradeLast: string | null;
};

const quoteFixtures = new Map<string, QuoteFixture>([
  [
    'AAPL',
    {
      close: 182.55,
      priceCurrency: 'USD',
      eodDate: '2026-03-11',
      tradeLast: '2026-03-11T21:00:00.000Z',
    },
  ],
  [
    'ASML',
    {
      close: 975.2,
      priceCurrency: 'EUR',
      eodDate: '2026-03-11',
      tradeLast: '2026-03-11T17:30:00.000Z',
    },
  ],
]);

await mock.module('../lib/s3', () => ({
  S3ConfigurationError: class MockS3ConfigurationError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'S3ConfigurationError';
    }
  },
  getS3BucketName: () => 'ticket7-test-bucket',
  checkS3Readiness: () => Promise.resolve(),
  uploadS3Object: ({ key, body }: { key: string; body: Buffer }) => {
    s3Objects.set(key, new Uint8Array(body));
  },
  getS3ObjectBytes: ({ key }: { key: string }) => {
    const existing = s3Objects.get(key);
    return existing ? Buffer.from(existing) : null;
  },
  deleteS3Object: ({ key }: { key: string }) => {
    s3Objects.delete(key);
  },
}));

await mock.module('../lib/marketDataClient', () => ({
  getMarketDataClient: () => ({
    lookupSymbol(symbol: string) {
      const normalized = symbol.trim().toUpperCase();
      return {
        name: `${normalized} Incorporated`,
        symbol: normalized,
        itemType: 'equity',
        sector: 'Technology',
        industry: 'Software',
        exchange: {
          mic: 'XNAS',
          name: 'NASDAQ',
          acronym: 'NASDAQ',
          country: 'United States',
          countryCode: 'US',
          city: 'New York',
          website: 'https://www.nasdaq.com',
        },
      };
    },
    getLatestEod(symbols: string[]) {
      return Object.fromEntries(
        symbols
          .map((symbol) => symbol.trim().toUpperCase())
          .filter((symbol) => quoteFixtures.has(symbol))
          .map((symbol) => [
            symbol,
            {
              symbol,
              ...quoteFixtures.get(symbol)!,
            },
          ]),
      );
    },
  }),
}));

const { createIntegrationHelpers } = await import('../test/integration');
const { db } = await import('../db/client');
const { pensionStatementImportRows, pensionStatementImports } = await import('../db/schema');

const integration = createIntegrationHelpers('ticket7.integration.quro.test');

type ApiDataResponse<T> = { data: T };

function buildPdfFile(fileName: string) {
  return new File(
    [Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<<>>\n%%EOF\n')],
    fileName,
    { type: 'application/pdf' },
  );
}

async function parseJson<T>(response: Response, expectedStatus: number): Promise<T> {
  expect(response.status).toBe(expectedStatus);
  return (await response.json()) as T;
}

describe('finance integration', () => {
  beforeAll(async () => {
    await integration.cleanup();
  });

  afterAll(async () => {
    s3Objects.clear();
    mock.clearAllMocks();
    mock.restore();
    await integration.cleanup();
  });

  test('covers salary payslip CRUD, mixed-currency history, and document flow', async () => {
    const owner = await integration.signUp('salary-owner');
    const stranger = await integration.signUp('salary-stranger');

    const createGbpResponse = await integration.request('/api/salary/payslips', {
      method: 'POST',
      cookie: owner.cookie,
      json: {
        month: 'March 2026',
        date: '2026-03-31',
        gross: 5000,
        tax: 1450,
        pension: 275,
        net: 3275,
        bonus: 200,
        currency: 'GBP',
      },
    });
    const createGbpBody = await parseJson<
      ApiDataResponse<{
        id: number;
        gross: string;
        currency: string;
        document: null;
      }>
    >(createGbpResponse, 201);
    expect(createGbpBody.data.currency).toBe('GBP');
    expect(Number(createGbpBody.data.gross)).toBe(5000);
    expect(createGbpBody.data.document).toBeNull();

    const createEurResponse = await integration.request('/api/salary/payslips', {
      method: 'POST',
      cookie: owner.cookie,
      json: {
        month: 'April 2026',
        date: '2026-04-30',
        gross: 4200,
        tax: 1200,
        pension: 250,
        net: 2750,
        bonus: null,
        currency: 'EUR',
      },
    });
    const createEurBody = await parseJson<
      ApiDataResponse<{
        id: number;
      }>
    >(createEurResponse, 201);

    const listResponse = await integration.request('/api/salary/payslips', {
      cookie: owner.cookie,
    });
    const listBody = await parseJson<ApiDataResponse<Array<{ id: number }>>>(listResponse, 200);
    expect(listBody.data.map((payslip) => payslip.id).sort((a, b) => a - b)).toEqual([
      createGbpBody.data.id,
      createEurBody.data.id,
    ]);

    const patchResponse = await integration.request(
      `/api/salary/payslips/${createGbpBody.data.id}`,
      {
        method: 'PATCH',
        cookie: owner.cookie,
        json: {
          bonus: 400,
          userId: stranger.user.id,
        },
      },
    );
    const patchBody = await parseJson<
      ApiDataResponse<{
        bonus: string | null;
      }>
    >(patchResponse, 200);
    expect(Number(patchBody.data.bonus)).toBe(400);

    const invalidPatchResponse = await integration.request(
      `/api/salary/payslips/${createGbpBody.data.id}`,
      {
        method: 'PATCH',
        cookie: owner.cookie,
        json: {
          grossAmount: 5100,
        },
      },
    );
    expect(invalidPatchResponse.status).toBe(400);
    expect(await invalidPatchResponse.json()).toEqual({
      error: 'Unknown field: grossAmount',
    });

    const strangerGetResponse = await integration.request(
      `/api/salary/payslips/${createGbpBody.data.id}`,
      {
        cookie: stranger.cookie,
      },
    );
    expect(strangerGetResponse.status).toBe(404);
    expect(await strangerGetResponse.json()).toEqual({ error: 'Payslip not found' });

    const historyResponse = await integration.request('/api/salary/history', {
      cookie: owner.cookie,
    });
    const historyBody = await parseJson<
      ApiDataResponse<
        Array<{
          id: number;
          year: number;
          annualSalary: string;
          currency: string;
        }>
      >
    >(historyResponse, 200);
    expect(historyBody.data).toEqual([
      {
        id: 1,
        year: 2026,
        annualSalary: '4200',
        currency: 'EUR',
      },
      {
        id: 2,
        year: 2026,
        annualSalary: '5400',
        currency: 'GBP',
      },
    ]);

    const uploadForm = new FormData();
    uploadForm.append('file', buildPdfFile('march-salary.pdf'));
    const uploadResponse = await integration.request(
      `/api/salary/payslips/${createGbpBody.data.id}/document`,
      {
        method: 'POST',
        cookie: owner.cookie,
        body: uploadForm,
      },
    );
    const uploadBody = await parseJson<
      ApiDataResponse<{
        fileName: string;
        mimeType: string;
        sizeBytes: number;
      }>
    >(uploadResponse, 201);
    expect(uploadBody.data.fileName).toBe('march-salary.pdf');
    expect(uploadBody.data.mimeType).toBe('application/pdf');
    expect(uploadBody.data.sizeBytes).toBeGreaterThan(0);

    const withDocumentResponse = await integration.request(
      `/api/salary/payslips/${createGbpBody.data.id}`,
      {
        cookie: owner.cookie,
      },
    );
    const withDocumentBody = await parseJson<
      ApiDataResponse<{
        document: {
          fileName: string;
          mimeType: string;
        } | null;
      }>
    >(withDocumentResponse, 200);
    expect(withDocumentBody.data.document).toMatchObject({
      fileName: 'march-salary.pdf',
      mimeType: 'application/pdf',
    });

    const downloadResponse = await integration.request(
      `/api/salary/payslips/${createGbpBody.data.id}/document/download`,
      {
        cookie: owner.cookie,
      },
    );
    expect(downloadResponse.status).toBe(200);
    expect(downloadResponse.headers.get('content-type')).toBe('application/pdf');
    expect(downloadResponse.headers.get('content-disposition')).toContain('march-salary.pdf');
    expect(Buffer.from(await downloadResponse.arrayBuffer()).toString('utf8')).toContain(
      '%PDF-1.4',
    );

    const deleteDocumentResponse = await integration.request(
      `/api/salary/payslips/${createGbpBody.data.id}/document`,
      {
        method: 'DELETE',
        cookie: owner.cookie,
      },
    );
    const deleteDocumentBody = await parseJson<
      ApiDataResponse<{
        fileName: string;
      }>
    >(deleteDocumentResponse, 200);
    expect(deleteDocumentBody.data.fileName).toBe('march-salary.pdf');

    const missingDocumentResponse = await integration.request(
      `/api/salary/payslips/${createGbpBody.data.id}/document/download`,
      {
        cookie: owner.cookie,
      },
    );
    expect(missingDocumentResponse.status).toBe(404);
    expect(await missingDocumentResponse.json()).toEqual({ error: 'Document not found' });

    const deletePayslipResponse = await integration.request(
      `/api/salary/payslips/${createGbpBody.data.id}`,
      {
        method: 'DELETE',
        cookie: owner.cookie,
      },
    );
    await parseJson<ApiDataResponse<{ id: number }>>(deletePayslipResponse, 200);

    const strangerDeleteResponse = await integration.request(
      `/api/salary/payslips/${createEurBody.data.id}`,
      {
        method: 'DELETE',
        cookie: stranger.cookie,
      },
    );
    expect(strangerDeleteResponse.status).toBe(404);
    expect(await strangerDeleteResponse.json()).toEqual({ error: 'Payslip not found' });
  });

  test('covers investments holdings, price sync boundaries, transactions, and property CRUD', async () => {
    const owner = await integration.signUp('investments-owner');
    const stranger = await integration.signUp('investments-stranger');

    const createHoldingResponse = await integration.request('/api/investments/holdings', {
      method: 'POST',
      cookie: owner.cookie,
      json: {
        name: 'Apple',
        ticker: 'aapl',
        currentPrice: '175.4',
        currency: 'USD',
        sector: 'Technology',
        itemType: 'equity',
        priceUpdatedAt: '2026-03-01T12:00:00.000Z',
        eodDate: '2026-03-01',
      },
    });
    const createHoldingBody = await parseJson<
      ApiDataResponse<{
        id: number;
        itemType: string | null;
      }>
    >(createHoldingResponse, 201);

    const createNoDataHoldingResponse = await integration.request('/api/investments/holdings', {
      method: 'POST',
      cookie: owner.cookie,
      json: {
        name: 'Unknown Asset',
        ticker: 'NODATA',
        currentPrice: '10',
        currency: 'USD',
        sector: 'Other',
        itemType: 'equity',
      },
    });
    const createNoDataHoldingBody = await parseJson<ApiDataResponse<{ id: number }>>(
      createNoDataHoldingResponse,
      201,
    );

    const createStrangerHoldingResponse = await integration.request('/api/investments/holdings', {
      method: 'POST',
      cookie: stranger.cookie,
      json: {
        name: 'ASML',
        ticker: 'asml',
        currentPrice: '900',
        currency: 'EUR',
        sector: 'Technology',
        itemType: 'equity',
      },
    });
    const createStrangerHoldingBody = await parseJson<ApiDataResponse<{ id: number }>>(
      createStrangerHoldingResponse,
      201,
    );

    const initialHistoryResponse = await integration.request(
      `/api/investments/holding-price-history?holdingIds=${createHoldingBody.data.id}`,
      {
        cookie: owner.cookie,
      },
    );
    const initialHistoryBody = await parseJson<
      ApiDataResponse<
        Array<{
          holdingId: number;
          closePrice: string;
          eodDate: string;
          priceCurrency: string;
        }>
      >
    >(initialHistoryResponse, 200);
    expect(initialHistoryBody.data).toHaveLength(1);
    expect(initialHistoryBody.data[0]).toMatchObject({
      holdingId: createHoldingBody.data.id,
      eodDate: '2026-03-01',
      priceCurrency: 'USD',
    });
    expect(Number(initialHistoryBody.data[0].closePrice)).toBe(175.4);

    const createHoldingTxnResponse = await integration.request(
      '/api/investments/holding-transactions',
      {
        method: 'POST',
        cookie: owner.cookie,
        json: {
          holdingId: createHoldingBody.data.id,
          type: 'buy',
          shares: 10,
          price: 170,
          date: '2026-03-02',
          note: 'Initial position',
        },
      },
    );
    const createHoldingTxnBody = await parseJson<
      ApiDataResponse<{
        id: number;
        holdingId: number;
      }>
    >(createHoldingTxnResponse, 201);
    expect(createHoldingTxnBody.data.holdingId).toBe(createHoldingBody.data.id);

    const strangerHoldingTxnResponse = await integration.request(
      '/api/investments/holding-transactions',
      {
        method: 'POST',
        cookie: owner.cookie,
        json: {
          holdingId: createStrangerHoldingBody.data.id,
          type: 'buy',
          shares: 1,
          price: 100,
          date: '2026-03-02',
          note: 'Should fail',
        },
      },
    );
    expect(strangerHoldingTxnResponse.status).toBe(404);
    expect(await strangerHoldingTxnResponse.json()).toEqual({ error: 'Holding not found' });

    const patchHoldingTxnResponse = await integration.request(
      `/api/investments/holding-transactions/${createHoldingTxnBody.data.id}`,
      {
        method: 'PATCH',
        cookie: owner.cookie,
        json: {
          type: 'dividend',
          shares: null,
          price: 42,
          note: 'Quarterly dividend',
          userId: stranger.user.id,
        },
      },
    );
    const patchHoldingTxnBody = await parseJson<
      ApiDataResponse<{
        type: string;
        note: string | null;
      }>
    >(patchHoldingTxnResponse, 200);
    expect(patchHoldingTxnBody.data).toMatchObject({
      type: 'dividend',
      note: 'Quarterly dividend',
    });

    const invalidSyncResponse = await integration.request('/api/investments/holdings/sync-prices', {
      method: 'POST',
      cookie: owner.cookie,
      json: {
        holdingIds: [createHoldingBody.data.id, 'bad-id'],
      },
    });
    expect(invalidSyncResponse.status).toBe(400);
    expect(await invalidSyncResponse.json()).toEqual({ error: 'Invalid holdingIds payload' });

    const syncResponse = await integration.request('/api/investments/holdings/sync-prices', {
      method: 'POST',
      cookie: owner.cookie,
      json: {
        holdingIds: [createHoldingBody.data.id, createNoDataHoldingBody.data.id],
      },
    });
    const syncBody = await parseJson<
      ApiDataResponse<{
        requestedHoldings: number;
        updatedHoldings: number;
        skippedHoldings: number;
        issues: Array<{ holdingId: number; reason: string; ticker: string }>;
      }>
    >(syncResponse, 200);
    expect(syncBody.data.requestedHoldings).toBe(2);
    expect(syncBody.data.updatedHoldings).toBe(1);
    expect(syncBody.data.skippedHoldings).toBe(1);
    expect(syncBody.data.issues).toEqual([
      {
        holdingId: createNoDataHoldingBody.data.id,
        reason: 'No EOD quote returned by provider',
        ticker: 'NODATA',
      },
    ]);

    const refreshedHoldingResponse = await integration.request(
      `/api/investments/holdings/${createHoldingBody.data.id}/refresh-price`,
      {
        method: 'POST',
        cookie: owner.cookie,
      },
    );
    const refreshedHoldingBody = await parseJson<
      ApiDataResponse<{
        id: number;
        currentPrice: string;
        currency: string;
      }> & {
        price: {
          eodDate: string;
          price: number;
        };
      }
    >(refreshedHoldingResponse, 200);
    expect(Number(refreshedHoldingBody.data.currentPrice)).toBe(182.55);
    expect(refreshedHoldingBody.data.currency).toBe('USD');
    expect(refreshedHoldingBody.price).toMatchObject({
      eodDate: '2026-03-11',
      price: 182.55,
    });

    const missingRefreshResponse = await integration.request(
      `/api/investments/holdings/${createStrangerHoldingBody.data.id}/refresh-price`,
      {
        method: 'POST',
        cookie: owner.cookie,
      },
    );
    expect(missingRefreshResponse.status).toBe(404);
    expect(await missingRefreshResponse.json()).toEqual({ error: 'Holding not found' });

    const historyAfterSyncResponse = await integration.request(
      `/api/investments/holding-price-history?holdingIds=${createHoldingBody.data.id}&from=2026-03-01&to=2026-03-11`,
      {
        cookie: owner.cookie,
      },
    );
    const historyAfterSyncBody = await parseJson<ApiDataResponse<Array<{ eodDate: string }>>>(
      historyAfterSyncResponse,
      200,
    );
    expect(historyAfterSyncBody.data.map((entry) => entry.eodDate)).toEqual([
      '2026-03-01',
      '2026-03-11',
    ]);

    const invalidPropertyResponse = await integration.request('/api/investments/properties', {
      method: 'POST',
      cookie: owner.cookie,
      json: {
        address: '12 Canal Street',
        propertyType: 'rental',
        purchasePrice: 300000,
        currentValue: 330000,
        monthlyRent: 1800,
        currency: 'EUR',
        mortgageId: 'abc',
      },
    });
    expect(invalidPropertyResponse.status).toBe(400);
    expect(await invalidPropertyResponse.json()).toEqual({ error: 'Invalid mortgage id' });

    const createPropertyResponse = await integration.request('/api/investments/properties', {
      method: 'POST',
      cookie: owner.cookie,
      json: {
        address: '12 Canal Street',
        propertyType: 'rental',
        purchasePrice: 300000,
        currentValue: 330000,
        monthlyRent: 1800,
        currency: 'EUR',
        emoji: 'H',
      },
    });
    const createPropertyBody = await parseJson<
      ApiDataResponse<{
        id: number;
        mortgage: string;
      }>
    >(createPropertyResponse, 201);
    expect(Number(createPropertyBody.data.mortgage)).toBe(0);

    const patchPropertyResponse = await integration.request(
      `/api/investments/properties/${createPropertyBody.data.id}`,
      {
        method: 'PATCH',
        cookie: owner.cookie,
        json: {
          currentValue: 345000,
          monthlyRent: 1900,
          userId: stranger.user.id,
        },
      },
    );
    const patchPropertyBody = await parseJson<
      ApiDataResponse<{
        currentValue: string;
        monthlyRent: string;
      }>
    >(patchPropertyResponse, 200);
    expect(Number(patchPropertyBody.data.currentValue)).toBe(345000);
    expect(Number(patchPropertyBody.data.monthlyRent)).toBe(1900);

    const listPropertiesResponse = await integration.request('/api/investments/properties', {
      cookie: owner.cookie,
    });
    const listPropertiesBody = await parseJson<ApiDataResponse<Array<{ id: number }>>>(
      listPropertiesResponse,
      200,
    );
    expect(listPropertiesBody.data.map((property) => property.id)).toEqual([
      createPropertyBody.data.id,
    ]);

    const deleteHoldingTxnResponse = await integration.request(
      `/api/investments/holding-transactions/${createHoldingTxnBody.data.id}`,
      {
        method: 'DELETE',
        cookie: owner.cookie,
      },
    );
    await parseJson<ApiDataResponse<{ id: number }>>(deleteHoldingTxnResponse, 200);

    const deletePropertyResponse = await integration.request(
      `/api/investments/properties/${createPropertyBody.data.id}`,
      {
        method: 'DELETE',
        cookie: owner.cookie,
      },
    );
    await parseJson<ApiDataResponse<{ id: number }>>(deletePropertyResponse, 200);
  });

  test('covers mortgage CRUD, property linking, transactions, and ownership checks', async () => {
    const owner = await integration.signUp('mortgage-owner');
    const stranger = await integration.signUp('mortgage-stranger');

    const ownerPropertyOneResponse = await integration.request('/api/investments/properties', {
      method: 'POST',
      cookie: owner.cookie,
      json: {
        address: '1 River Lane',
        propertyType: 'primary_home',
        purchasePrice: 420000,
        currentValue: 500000,
        monthlyRent: 0,
        currency: 'EUR',
        emoji: 'R',
      },
    });
    const ownerPropertyOneBody = await parseJson<ApiDataResponse<{ id: number }>>(
      ownerPropertyOneResponse,
      201,
    );

    const ownerPropertyTwoResponse = await integration.request('/api/investments/properties', {
      method: 'POST',
      cookie: owner.cookie,
      json: {
        address: '99 Harbor Road',
        propertyType: 'primary_home',
        purchasePrice: 450000,
        currentValue: 540000,
        monthlyRent: 0,
        currency: 'EUR',
        emoji: 'H',
      },
    });
    const ownerPropertyTwoBody = await parseJson<ApiDataResponse<{ id: number }>>(
      ownerPropertyTwoResponse,
      201,
    );

    const strangerPropertyResponse = await integration.request('/api/investments/properties', {
      method: 'POST',
      cookie: stranger.cookie,
      json: {
        address: '7 Other Street',
        propertyType: 'primary_home',
        purchasePrice: 250000,
        currentValue: 280000,
        monthlyRent: 0,
        currency: 'GBP',
        emoji: 'O',
      },
    });
    const strangerPropertyBody = await parseJson<ApiDataResponse<{ id: number }>>(
      strangerPropertyResponse,
      201,
    );

    const createMortgageResponse = await integration.request('/api/mortgages', {
      method: 'POST',
      cookie: owner.cookie,
      json: {
        linkedPropertyId: ownerPropertyOneBody.data.id,
        lender: 'ING',
        originalAmount: 350000,
        outstandingBalance: 300000,
        propertyValue: 499999,
        monthlyPayment: 1550,
        interestRate: 2.4,
        rateType: 'fixed',
        fixedUntil: '2031-06-30',
        termYears: 30,
        startDate: '2021-07-01',
        endDate: '2051-07-01',
        overpaymentLimit: 10,
      },
    });
    const createMortgageBody = await parseJson<
      ApiDataResponse<{
        id: number;
        propertyAddress: string;
        currency: string;
        propertyValue: string;
      }>
    >(createMortgageResponse, 201);
    expect(createMortgageBody.data).toMatchObject({
      propertyAddress: '1 River Lane',
      currency: 'EUR',
    });
    expect(Number(createMortgageBody.data.propertyValue)).toBe(500000);

    const linkedPropertyOneResponse = await integration.request(
      `/api/investments/properties/${ownerPropertyOneBody.data.id}`,
      {
        cookie: owner.cookie,
      },
    );
    const linkedPropertyOneBody = await parseJson<
      ApiDataResponse<{
        mortgageId: number | null;
        mortgage: string;
      }>
    >(linkedPropertyOneResponse, 200);
    expect(linkedPropertyOneBody.data.mortgageId).toBe(createMortgageBody.data.id);
    expect(Number(linkedPropertyOneBody.data.mortgage)).toBe(300000);

    const conflictMortgageResponse = await integration.request('/api/mortgages', {
      method: 'POST',
      cookie: owner.cookie,
      json: {
        linkedPropertyId: ownerPropertyOneBody.data.id,
        lender: 'Rabobank',
        originalAmount: 200000,
        outstandingBalance: 180000,
        monthlyPayment: 950,
        interestRate: 3.1,
        rateType: 'variable',
        termYears: 20,
        startDate: '2022-01-01',
        endDate: '2042-01-01',
      },
    });
    expect(conflictMortgageResponse.status).toBe(409);
    expect(await conflictMortgageResponse.json()).toEqual({
      error: 'Property already has a linked mortgage',
    });

    const strangerPropertyMortgageResponse = await integration.request('/api/mortgages', {
      method: 'POST',
      cookie: owner.cookie,
      json: {
        linkedPropertyId: strangerPropertyBody.data.id,
        lender: 'Rabobank',
        originalAmount: 200000,
        outstandingBalance: 180000,
        monthlyPayment: 950,
        interestRate: 3.1,
        rateType: 'variable',
        termYears: 20,
        startDate: '2022-01-01',
        endDate: '2042-01-01',
      },
    });
    expect(strangerPropertyMortgageResponse.status).toBe(404);
    expect(await strangerPropertyMortgageResponse.json()).toEqual({ error: 'Property not found' });

    const patchMortgageResponse = await integration.request(
      `/api/mortgages/${createMortgageBody.data.id}`,
      {
        method: 'PATCH',
        cookie: owner.cookie,
        json: {
          linkedPropertyId: ownerPropertyTwoBody.data.id,
          outstandingBalance: 295000,
          monthlyPayment: 1600,
          userId: stranger.user.id,
        },
      },
    );
    const patchMortgageBody = await parseJson<
      ApiDataResponse<{
        propertyAddress: string;
        propertyValue: string;
        outstandingBalance: string;
      }>
    >(patchMortgageResponse, 200);
    expect(patchMortgageBody.data.propertyAddress).toBe('99 Harbor Road');
    expect(Number(patchMortgageBody.data.propertyValue)).toBe(540000);
    expect(Number(patchMortgageBody.data.outstandingBalance)).toBe(295000);

    const propertyOneAfterMoveResponse = await integration.request(
      `/api/investments/properties/${ownerPropertyOneBody.data.id}`,
      {
        cookie: owner.cookie,
      },
    );
    const propertyOneAfterMoveBody = await parseJson<
      ApiDataResponse<{
        mortgageId: number | null;
        mortgage: string;
      }>
    >(propertyOneAfterMoveResponse, 200);
    expect(propertyOneAfterMoveBody.data.mortgageId).toBeNull();
    expect(Number(propertyOneAfterMoveBody.data.mortgage)).toBe(0);

    const propertyTwoAfterMoveResponse = await integration.request(
      `/api/investments/properties/${ownerPropertyTwoBody.data.id}`,
      {
        cookie: owner.cookie,
      },
    );
    const propertyTwoAfterMoveBody = await parseJson<
      ApiDataResponse<{
        mortgageId: number | null;
        mortgage: string;
      }>
    >(propertyTwoAfterMoveResponse, 200);
    expect(propertyTwoAfterMoveBody.data.mortgageId).toBe(createMortgageBody.data.id);
    expect(Number(propertyTwoAfterMoveBody.data.mortgage)).toBe(295000);

    const createMortgageTxnResponse = await integration.request('/api/mortgages/transactions', {
      method: 'POST',
      cookie: owner.cookie,
      json: {
        mortgageId: createMortgageBody.data.id,
        type: 'repayment',
        amount: 1600,
        interest: 600,
        principal: 1000,
        date: '2026-03-05',
        note: 'Monthly repayment',
      },
    });
    const createMortgageTxnBody = await parseJson<
      ApiDataResponse<{
        id: number;
        mortgageId: number;
      }>
    >(createMortgageTxnResponse, 201);
    expect(createMortgageTxnBody.data.mortgageId).toBe(createMortgageBody.data.id);

    const listMortgageTxnsResponse = await integration.request(
      `/api/mortgages/transactions?mortgageId=${createMortgageBody.data.id}`,
      {
        cookie: owner.cookie,
      },
    );
    const listMortgageTxnsBody = await parseJson<ApiDataResponse<Array<{ id: number }>>>(
      listMortgageTxnsResponse,
      200,
    );
    expect(listMortgageTxnsBody.data.map((txn) => txn.id)).toEqual([createMortgageTxnBody.data.id]);

    const patchMortgageTxnResponse = await integration.request(
      `/api/mortgages/transactions/${createMortgageTxnBody.data.id}`,
      {
        method: 'PATCH',
        cookie: owner.cookie,
        json: {
          type: 'rate_change',
          amount: 2.1,
          fixedYears: 5,
          note: 'Refixed term',
          userId: stranger.user.id,
        },
      },
    );
    const patchMortgageTxnBody = await parseJson<
      ApiDataResponse<{
        type: string;
        fixedYears: string | null;
        note: string | null;
      }>
    >(patchMortgageTxnResponse, 200);
    expect(patchMortgageTxnBody.data).toMatchObject({
      type: 'rate_change',
      fixedYears: '5.0',
      note: 'Refixed term',
    });

    const strangerMortgageTxnResponse = await integration.request('/api/mortgages/transactions', {
      method: 'POST',
      cookie: stranger.cookie,
      json: {
        mortgageId: createMortgageBody.data.id,
        type: 'repayment',
        amount: 1000,
        date: '2026-03-06',
      },
    });
    expect(strangerMortgageTxnResponse.status).toBe(404);
    expect(await strangerMortgageTxnResponse.json()).toEqual({ error: 'Mortgage not found' });

    const deleteMortgageTxnResponse = await integration.request(
      `/api/mortgages/transactions/${createMortgageTxnBody.data.id}`,
      {
        method: 'DELETE',
        cookie: owner.cookie,
      },
    );
    await parseJson<ApiDataResponse<{ id: number }>>(deleteMortgageTxnResponse, 200);

    const deleteMortgageResponse = await integration.request(
      `/api/mortgages/${createMortgageBody.data.id}`,
      {
        method: 'DELETE',
        cookie: owner.cookie,
      },
    );
    await parseJson<ApiDataResponse<{ id: number }>>(deleteMortgageResponse, 200);

    const propertyTwoAfterDeleteResponse = await integration.request(
      `/api/investments/properties/${ownerPropertyTwoBody.data.id}`,
      {
        cookie: owner.cookie,
      },
    );
    const propertyTwoAfterDeleteBody = await parseJson<
      ApiDataResponse<{
        mortgageId: number | null;
        mortgage: string;
      }>
    >(propertyTwoAfterDeleteResponse, 200);
    expect(propertyTwoAfterDeleteBody.data.mortgageId).toBeNull();
    expect(Number(propertyTwoAfterDeleteBody.data.mortgage)).toBe(0);
  });

  test('covers pension pot and transaction CRUD with balance reconciliation and ownership checks', async () => {
    const owner = await integration.signUp('pension-owner');
    const stranger = await integration.signUp('pension-stranger');

    const createPotOneResponse = await integration.request('/api/pensions/pots', {
      method: 'POST',
      cookie: owner.cookie,
      json: {
        name: 'Work Pension',
        provider: 'Aegon',
        type: 'defined_contribution',
        balance: 10000,
        currency: 'GBP',
        employeeMonthly: 200,
        employerMonthly: 150,
        investmentStrategy: 'Balanced',
        color: '#1d4ed8',
        emoji: 'P',
        notes: 'Primary workplace pension',
      },
    });
    const createPotOneBody = await parseJson<ApiDataResponse<{ id: number }>>(
      createPotOneResponse,
      201,
    );

    const createPotTwoResponse = await integration.request('/api/pensions/pots', {
      method: 'POST',
      cookie: owner.cookie,
      json: {
        name: 'Old Employer Pension',
        provider: 'Vanguard',
        type: 'defined_contribution',
        balance: 2000,
        currency: 'EUR',
        employeeMonthly: 0,
        employerMonthly: 0,
        investmentStrategy: 'Global Equity',
        color: '#0f766e',
        emoji: 'O',
      },
    });
    const createPotTwoBody = await parseJson<ApiDataResponse<{ id: number }>>(
      createPotTwoResponse,
      201,
    );

    const strangerPotResponse = await integration.request('/api/pensions/pots', {
      method: 'POST',
      cookie: stranger.cookie,
      json: {
        name: 'Foreign Pot',
        provider: 'Other',
        type: 'defined_contribution',
        balance: 500,
        currency: 'USD',
        employeeMonthly: 10,
        employerMonthly: 10,
        investmentStrategy: 'Cash',
        color: '#475569',
        emoji: 'F',
      },
    });
    const strangerPotBody = await parseJson<ApiDataResponse<{ id: number }>>(
      strangerPotResponse,
      201,
    );

    const patchPotOneResponse = await integration.request(
      `/api/pensions/pots/${createPotOneBody.data.id}`,
      {
        method: 'PATCH',
        cookie: owner.cookie,
        json: {
          notes: 'Updated pension notes',
          provider: 'Aegon UK',
          userId: stranger.user.id,
        },
      },
    );
    const patchPotOneBody = await parseJson<
      ApiDataResponse<{
        notes: string | null;
        provider: string;
      }>
    >(patchPotOneResponse, 200);
    expect(patchPotOneBody.data).toMatchObject({
      notes: 'Updated pension notes',
      provider: 'Aegon UK',
    });

    const invalidContributionResponse = await integration.request('/api/pensions/transactions', {
      method: 'POST',
      cookie: owner.cookie,
      json: {
        potId: createPotOneBody.data.id,
        type: 'contribution',
        amount: 500,
        taxAmount: 100,
        date: '2026-03-05',
        note: 'Missing source flag',
      },
    });
    expect(invalidContributionResponse.status).toBe(400);
    expect(await invalidContributionResponse.json()).toEqual({
      error: 'Contribution requires employer/employee source',
    });

    const createContributionResponse = await integration.request('/api/pensions/transactions', {
      method: 'POST',
      cookie: owner.cookie,
      json: {
        potId: createPotOneBody.data.id,
        type: 'contribution',
        amount: 500,
        taxAmount: 100,
        date: '2026-03-05',
        note: 'Monthly employee contribution',
        isEmployer: false,
      },
    });
    const createContributionBody = await parseJson<
      ApiDataResponse<{
        id: number;
        potId: number;
      }>
    >(createContributionResponse, 201);
    expect(createContributionBody.data.potId).toBe(createPotOneBody.data.id);

    const potOneAfterContributionResponse = await integration.request(
      `/api/pensions/pots/${createPotOneBody.data.id}`,
      {
        cookie: owner.cookie,
      },
    );
    const potOneAfterContributionBody = await parseJson<
      ApiDataResponse<{
        balance: string;
      }>
    >(potOneAfterContributionResponse, 200);
    expect(Number(potOneAfterContributionBody.data.balance)).toBe(10400);

    const foreignPotTxnResponse = await integration.request('/api/pensions/transactions', {
      method: 'POST',
      cookie: owner.cookie,
      json: {
        potId: strangerPotBody.data.id,
        type: 'fee',
        amount: 25,
        date: '2026-03-06',
        note: 'Should fail',
      },
    });
    expect(foreignPotTxnResponse.status).toBe(404);
    expect(await foreignPotTxnResponse.json()).toEqual({ error: 'Pension pot not found' });

    const moveContributionResponse = await integration.request(
      `/api/pensions/transactions/${createContributionBody.data.id}`,
      {
        method: 'PATCH',
        cookie: owner.cookie,
        json: {
          potId: createPotTwoBody.data.id,
          amount: 600,
          taxAmount: 50,
          note: 'Transferred correction',
          isEmployer: true,
        },
      },
    );
    const moveContributionBody = await parseJson<
      ApiDataResponse<{
        potId: number;
        amount: string;
        taxAmount: string;
        isEmployer: boolean | null;
      }>
    >(moveContributionResponse, 200);
    expect(moveContributionBody.data).toMatchObject({
      potId: createPotTwoBody.data.id,
      isEmployer: true,
    });
    expect(Number(moveContributionBody.data.amount)).toBe(600);
    expect(Number(moveContributionBody.data.taxAmount)).toBe(50);

    const potOneAfterMoveResponse = await integration.request(
      `/api/pensions/pots/${createPotOneBody.data.id}`,
      {
        cookie: owner.cookie,
      },
    );
    const potOneAfterMoveBody = await parseJson<
      ApiDataResponse<{
        balance: string;
      }>
    >(potOneAfterMoveResponse, 200);
    expect(Number(potOneAfterMoveBody.data.balance)).toBe(10000);

    const potTwoAfterMoveResponse = await integration.request(
      `/api/pensions/pots/${createPotTwoBody.data.id}`,
      {
        cookie: owner.cookie,
      },
    );
    const potTwoAfterMoveBody = await parseJson<
      ApiDataResponse<{
        balance: string;
      }>
    >(potTwoAfterMoveResponse, 200);
    expect(Number(potTwoAfterMoveBody.data.balance)).toBe(2550);

    const createFeeResponse = await integration.request('/api/pensions/transactions', {
      method: 'POST',
      cookie: owner.cookie,
      json: {
        potId: createPotTwoBody.data.id,
        type: 'fee',
        amount: 25,
        date: '2026-03-08',
        note: 'Platform fee',
      },
    });
    const createFeeBody = await parseJson<ApiDataResponse<{ id: number }>>(createFeeResponse, 201);

    const listPotTwoTransactionsResponse = await integration.request(
      `/api/pensions/transactions?potId=${createPotTwoBody.data.id}`,
      {
        cookie: owner.cookie,
      },
    );
    const listPotTwoTransactionsBody = await parseJson<ApiDataResponse<Array<{ id: number }>>>(
      listPotTwoTransactionsResponse,
      200,
    );
    expect(listPotTwoTransactionsBody.data.map((txn) => txn.id).sort((a, b) => a - b)).toEqual([
      createContributionBody.data.id,
      createFeeBody.data.id,
    ]);

    const deleteFeeResponse = await integration.request(
      `/api/pensions/transactions/${createFeeBody.data.id}`,
      {
        method: 'DELETE',
        cookie: owner.cookie,
      },
    );
    await parseJson<ApiDataResponse<{ id: number }>>(deleteFeeResponse, 200);

    const potTwoAfterFeeDeleteResponse = await integration.request(
      `/api/pensions/pots/${createPotTwoBody.data.id}`,
      {
        cookie: owner.cookie,
      },
    );
    const potTwoAfterFeeDeleteBody = await parseJson<
      ApiDataResponse<{
        balance: string;
      }>
    >(potTwoAfterFeeDeleteResponse, 200);
    expect(Number(potTwoAfterFeeDeleteBody.data.balance)).toBe(2550);

    const deleteContributionResponse = await integration.request(
      `/api/pensions/transactions/${createContributionBody.data.id}`,
      {
        method: 'DELETE',
        cookie: owner.cookie,
      },
    );
    await parseJson<ApiDataResponse<{ id: number }>>(deleteContributionResponse, 200);

    const potTwoAfterContributionDeleteResponse = await integration.request(
      `/api/pensions/pots/${createPotTwoBody.data.id}`,
      {
        cookie: owner.cookie,
      },
    );
    const potTwoAfterContributionDeleteBody = await parseJson<
      ApiDataResponse<{
        balance: string;
      }>
    >(potTwoAfterContributionDeleteResponse, 200);
    expect(Number(potTwoAfterContributionDeleteBody.data.balance)).toBe(2000);

    const strangerDeletePotResponse = await integration.request(
      `/api/pensions/pots/${createPotOneBody.data.id}`,
      {
        method: 'DELETE',
        cookie: stranger.cookie,
      },
    );
    expect(strangerDeletePotResponse.status).toBe(404);
    expect(await strangerDeletePotResponse.json()).toEqual({ error: 'Pension pot not found' });

    const deletePotOneResponse = await integration.request(
      `/api/pensions/pots/${createPotOneBody.data.id}`,
      {
        method: 'DELETE',
        cookie: owner.cookie,
      },
    );
    await parseJson<ApiDataResponse<{ id: number }>>(deletePotOneResponse, 200);

    const deletePotTwoResponse = await integration.request(
      `/api/pensions/pots/${createPotTwoBody.data.id}`,
      {
        method: 'DELETE',
        cookie: owner.cookie,
      },
    );
    await parseJson<ApiDataResponse<{ id: number }>>(deletePotTwoResponse, 200);
  });

  test('rejects invalid payloads across the remaining finance write paths', async () => {
    const owner = await integration.signUp('finance-validation');

    const invalidPayslipResponse = await integration.request('/api/salary/payslips', {
      method: 'POST',
      cookie: owner.cookie,
      json: {
        month: 'May 2026',
        date: '2026-05-31',
        gross: 5000,
        tax: -1,
        pension: 250,
        net: 3250,
        bonus: null,
        currency: 'EUR',
      },
    });
    expect(invalidPayslipResponse.status).toBe(400);
    expect(await invalidPayslipResponse.json()).toEqual({ error: 'Invalid tax' });

    const invalidHoldingResponse = await integration.request('/api/investments/holdings', {
      method: 'POST',
      cookie: owner.cookie,
      json: {
        name: 'Broken Holding',
        ticker: 'BRKN',
        currentPrice: 12,
        currency: 'EUR',
        sector: 'Other',
        itemType: 'crypto',
      },
    });
    expect(invalidHoldingResponse.status).toBe(400);
    expect(await invalidHoldingResponse.json()).toEqual({
      error: 'Invalid holding item type',
    });

    const createHoldingResponse = await integration.request('/api/investments/holdings', {
      method: 'POST',
      cookie: owner.cookie,
      json: {
        name: 'ETF',
        ticker: 'NDQ',
        currentPrice: 42.5,
        currency: 'AUD',
        sector: 'Technology',
        itemType: 'etf',
      },
    });
    const createHoldingBody = await parseJson<ApiDataResponse<{ id: number }>>(
      createHoldingResponse,
      201,
    );

    const invalidHoldingTxnResponse = await integration.request(
      '/api/investments/holding-transactions',
      {
        method: 'POST',
        cookie: owner.cookie,
        json: {
          holdingId: createHoldingBody.data.id,
          type: 'dividend',
          shares: 1,
          price: 5,
          date: '2026-03-15',
          note: 'Should fail',
        },
      },
    );
    expect(invalidHoldingTxnResponse.status).toBe(400);
    expect(await invalidHoldingTxnResponse.json()).toEqual({
      error: 'Dividend transactions cannot include shares',
    });

    const createPrimaryHomeResponse = await integration.request('/api/investments/properties', {
      method: 'POST',
      cookie: owner.cookie,
      json: {
        address: '44 Garden Lane',
        propertyType: 'Primary Residence',
        purchasePrice: 425000,
        currentValue: 480000,
        mortgage: 0,
        mortgageId: null,
        monthlyRent: 0,
        currency: 'EUR',
        emoji: 'H',
      },
    });
    const createPrimaryHomeBody = await parseJson<ApiDataResponse<{ id: number }>>(
      createPrimaryHomeResponse,
      201,
    );

    const invalidPropertyTxnResponse = await integration.request(
      '/api/investments/property-transactions',
      {
        method: 'POST',
        cookie: owner.cookie,
        json: {
          propertyId: createPrimaryHomeBody.data.id,
          type: 'rent_income',
          amount: 1200,
          interest: null,
          principal: null,
          date: '2026-03-15',
          note: 'Should fail',
        },
      },
    );
    expect(invalidPropertyTxnResponse.status).toBe(400);
    expect(await invalidPropertyTxnResponse.json()).toEqual({
      error: 'Rent and expense transactions are only supported for investment properties',
    });

    const invalidRepaymentTxnResponse = await integration.request(
      '/api/investments/property-transactions',
      {
        method: 'POST',
        cookie: owner.cookie,
        json: {
          propertyId: createPrimaryHomeBody.data.id,
          type: 'repayment',
          amount: 900,
          interest: 250,
          principal: 650,
          date: '2026-03-16',
          note: 'Should fail',
        },
      },
    );
    expect(invalidRepaymentTxnResponse.status).toBe(400);
    expect(await invalidRepaymentTxnResponse.json()).toEqual({
      error: 'Property is not linked to a mortgage',
    });

    const invalidMortgageResponse = await integration.request('/api/mortgages', {
      method: 'POST',
      cookie: owner.cookie,
      json: {
        linkedPropertyId: createPrimaryHomeBody.data.id,
        propertyAddress: 'Ignored',
        lender: 'ING',
        currency: 'EUR',
        originalAmount: 250000,
        outstandingBalance: 260000,
        propertyValue: 480000,
        monthlyPayment: 1250,
        interestRate: 3.1,
        rateType: 'fixed',
        fixedUntil: '2030-06',
        termYears: 30,
        startDate: '2020-01',
        endDate: '2050-01',
        overpaymentLimit: 10,
      },
    });
    expect(invalidMortgageResponse.status).toBe(400);
    expect(await invalidMortgageResponse.json()).toEqual({
      error: 'Outstanding balance cannot exceed the original amount',
    });

    const invalidPensionPotResponse = await integration.request('/api/pensions/pots', {
      method: 'POST',
      cookie: owner.cookie,
      json: {
        name: 'Broken Pot',
        provider: 'Aegon',
        type: 'defined_contribution',
        balance: 1000,
        currency: 'EUR',
        employeeMonthly: 50,
        employerMonthly: 25,
        investmentStrategy: 'Balanced',
        metadata: {
          policy: {
            number: 'ABC',
          },
        },
        color: '#2563eb',
        emoji: 'P',
        notes: 'Should fail',
      },
    });
    expect(invalidPensionPotResponse.status).toBe(400);
    expect(await invalidPensionPotResponse.json()).toEqual({
      error: 'Metadata values must be strings, numbers, or booleans',
    });

    const createPensionPotResponse = await integration.request('/api/pensions/pots', {
      method: 'POST',
      cookie: owner.cookie,
      json: {
        name: 'Valid Pot',
        provider: 'Aegon',
        type: 'defined_contribution',
        balance: 5000,
        currency: 'EUR',
        employeeMonthly: 100,
        employerMonthly: 50,
        investmentStrategy: 'Balanced',
        metadata: {
          policyNumber: 'ABC-123',
        },
        color: '#1d4ed8',
        emoji: 'P',
        notes: 'For import validation',
      },
    });
    const createPensionPotBody = await parseJson<ApiDataResponse<{ id: number }>>(
      createPensionPotResponse,
      201,
    );

    const now = new Date('2026-03-20T10:00:00.000Z');
    const [importRecord] = await db
      .insert(pensionStatementImports)
      .values({
        userId: owner.user.id,
        potId: createPensionPotBody.data.id,
        status: 'ready_for_review',
        storageKey: 'users/test/imports/statement.pdf',
        fileName: 'statement.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 128,
        fileHashSha256: 'hash-123',
        languageHints: ['en'],
        createdAt: now,
        updatedAt: now,
        expiresAt: new Date('2026-03-27T10:00:00.000Z'),
      })
      .returning({ id: pensionStatementImports.id });

    const [importRow] = await db
      .insert(pensionStatementImportRows)
      .values({
        importId: importRecord.id,
        rowOrder: 0,
        type: 'fee',
        amount: '15',
        taxAmount: '0',
        date: '2026-03-10',
        note: '',
        isEmployer: null,
        confidence: '0.9',
        confidenceLabel: 'high',
        evidence: [],
        isDerived: false,
        isDeleted: false,
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: pensionStatementImportRows.id });

    const invalidImportRowDateResponse = await integration.request(
      `/api/pensions/imports/${importRecord.id}/rows/${importRow.id}`,
      {
        method: 'PATCH',
        cookie: owner.cookie,
        json: {
          date: '2026-02-30',
        },
      },
    );
    expect(invalidImportRowDateResponse.status).toBe(400);
    expect(await invalidImportRowDateResponse.json()).toEqual({
      error: 'Invalid transaction date',
    });

    const unknownImportRowFieldResponse = await integration.request(
      `/api/pensions/imports/${importRecord.id}/rows/${importRow.id}`,
      {
        method: 'PATCH',
        cookie: owner.cookie,
        json: {
          source: 'csv',
        },
      },
    );
    expect(unknownImportRowFieldResponse.status).toBe(400);
    expect(await unknownImportRowFieldResponse.json()).toEqual({
      error: 'Unknown field: source',
    });
  });
});
