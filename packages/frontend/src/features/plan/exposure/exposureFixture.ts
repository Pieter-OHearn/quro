import {
  EXPOSURE_DEFAULTS_VERSION,
  buildExposureView,
  computeExposureFacts,
  defaultExposureSettings,
  type ExposureHoldingInput,
  type ExposureReport,
} from '@quro/shared';

function holding(overrides: Partial<ExposureHoldingInput> & { id: number }): ExposureHoldingInput {
  return {
    name: `Holding ${overrides.id}`,
    ticker: `H${overrides.id}`,
    currency: 'EUR',
    sector: 'Diversified',
    itemType: 'etf',
    assetClass: 'equity_developed',
    riskClassOverride: null,
    shares: 10,
    unitPrice: 100,
    priceSource: 'synced',
    priceUpdatedAt: '2026-10-09T18:00:00.000Z',
    priceStale: false,
    ...overrides,
  };
}

/** A small synthetic report for component tests, built by the same code the API runs. */
export function buildReport(
  holdings: ExposureHoldingInput[],
  options: { selectedMix?: 'A' | 'B' | 'C' | 'D'; stale?: boolean } = {},
): ExposureReport {
  const settings = defaultExposureSettings();
  settings.selectedMix = options.selectedMix ?? null;
  const facts = computeExposureFacts({
    asOf: '2026-10-09',
    baseCurrency: 'EUR',
    settings,
    settingsSource: 'default',
    holdings,
    fxRates: [
      {
        currency: 'USD',
        rate: 0.9,
        sourceDate: '2026-10-09',
        updatedAt: '2026-10-09T18:00:00.000Z',
        stale: options.stale ?? false,
      },
    ],
  });
  return {
    facts,
    view: buildExposureView(facts),
    settings: {
      settings,
      source: 'default',
      updatedAt: null,
      defaultsVersion: EXPOSURE_DEFAULTS_VERSION,
      storedInvalid: false,
    },
  };
}

export { holding as exposureHolding };
