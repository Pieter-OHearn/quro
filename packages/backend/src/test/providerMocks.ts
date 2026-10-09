import { mock } from 'bun:test';
import { createMemoryDocumentStore } from './memoryDocumentStore';

/**
 * Replaces document storage, market data and the import capability for the whole bun process so
 * that routes which would call a provider run offline. Call `restore` in `afterAll`: module
 * mocks outlive the file that installs them.
 */
export async function installProviderMocks() {
  const documents = createMemoryDocumentStore();
  const real = {
    documentStorage: { ...(await import('../lib/documentStorage')) },
    capabilities: { ...(await import('../lib/capabilities')) },
    marketData: { ...(await import('../lib/marketDataClient')) },
  };

  await mock.module('../lib/documentStorage', () => ({
    ...real.documentStorage,
    getDocumentStore: () => documents.store,
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
    storedDocuments: documents.objects,
    restore: async () => {
      documents.objects.clear();
      await mock.module('../lib/documentStorage', () => real.documentStorage);
      await mock.module('../lib/capabilities', () => real.capabilities);
      await mock.module('../lib/marketDataClient', () => real.marketData);
    },
  };
}
