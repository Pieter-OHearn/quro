import { mock } from 'bun:test';

/**
 * Replaces object storage, market data and the import capability for the whole bun process so
 * that routes which would call a provider run offline. Call `restore` in `afterAll`: module
 * mocks outlive the file that installs them.
 */
export async function installProviderMocks() {
  const s3Objects = new Map<string, Uint8Array>();
  const real = {
    s3: { ...(await import('../lib/s3')) },
    capabilities: { ...(await import('../lib/capabilities')) },
    marketData: { ...(await import('../lib/marketDataClient')) },
  };

  await mock.module('../lib/s3', () => ({
    S3ConfigurationError: class MockS3ConfigurationError extends Error {
      constructor(message: string) {
        super(message);
        this.name = 'S3ConfigurationError';
      }
    },
    getS3BucketName: () => 'provider-mocks-test-bucket',
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
    deleteS3Objects: (keys: readonly string[]) => {
      for (const key of keys) s3Objects.delete(key);
      return Promise.resolve({ deletedKeys: [...keys], failedKeys: [] });
    },
  }));

  await mock.module('../lib/capabilities', () => {
    const capability = () =>
      Promise.resolve({
        enabled: true,
        reason: null,
        message: 'Import is available.',
        checkedAt: new Date('2026-03-01T12:00:00.000Z').toISOString(),
      });
    return {
      getPensionStatementImportCapability: capability,
      getAppCapabilities: async () => ({
        ai: await capability(),
        pensionStatementImport: await capability(),
      }),
    };
  });

  // Only the synthetic ticker S04 has a quote; a lookup is never expected.
  await mock.module('../lib/marketDataClient', () => ({
    getMarketDataClient: () => ({
      lookupSymbol: () => {
        throw new Error('No market-data lookup is expected in these tests');
      },
      getLatestEod: (symbols: string[]) =>
        Object.fromEntries(
          symbols
            .filter((symbol) => symbol.trim().toUpperCase() === 'S04')
            .map((symbol) => [
              symbol,
              {
                symbol,
                close: 11,
                priceCurrency: 'EUR',
                eodDate: '2026-03-11',
                tradeLast: '2026-03-11T17:30:00.000Z',
              },
            ]),
        ),
    }),
  }));

  return {
    s3Objects,
    restore: async () => {
      s3Objects.clear();
      await mock.module('../lib/s3', () => real.s3);
      await mock.module('../lib/capabilities', () => real.capabilities);
      await mock.module('../lib/marketDataClient', () => real.marketData);
    },
  };
}
