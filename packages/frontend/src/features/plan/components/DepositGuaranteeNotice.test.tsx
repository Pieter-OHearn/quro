import { describe, expect, test } from 'bun:test';
import type { RunwayResponse } from '@quro/shared';
import { renderToStaticMarkup } from 'react-dom/server';
import { DepositGuaranteeNotice } from './DepositGuaranteeNotice';

const noop = () => undefined;
const fmt = (value: number) => `€${value.toLocaleString('en-US')}`;

function guarantee(
  overrides: Partial<RunwayResponse['depositGuarantee'][number]>,
): RunwayResponse['depositGuarantee'][number] {
  return {
    entityId: null,
    entityName: 'Mystery Brand',
    scheme: 'Nederlandse Depositogarantie',
    total: 25_000,
    cap: 100_000,
    excess: 0,
    ineligibleCurrencyTotal: 0,
    confidence: 'unverified',
    accountIds: [7],
    ...overrides,
  };
}

describe('deposit guarantee notice', () => {
  test('renders unresolved entities as a compact actionable row', () => {
    const markup = renderToStaticMarkup(
      <DepositGuaranteeNotice guarantees={[guarantee({})]} fmtBase={fmt} onReview={noop} />,
    );
    expect(markup).toContain('1 bank account need entity review');
    expect(markup).toContain('Review banks');
    expect(markup).not.toContain('Unverified banking entities');
  });

  test('uses the prominent warning only for a modelled cap exposure', () => {
    const markup = renderToStaticMarkup(
      <DepositGuaranteeNotice
        guarantees={[
          guarantee({
            entityId: 'bunq',
            entityName: 'bunq B.V.',
            confidence: 'verified',
            total: 125_000,
            excess: 25_000,
          }),
        ]}
        fmtBase={fmt}
        onReview={noop}
      />,
    );
    expect(markup).toContain('Deposit guarantee review');
    expect(markup).toContain('€25,000 is above the modelled €100,000 cap');
  });

  test('keeps unresolved accounts actionable beside a separate cap exposure', () => {
    const markup = renderToStaticMarkup(
      <DepositGuaranteeNotice
        guarantees={[
          guarantee({
            entityId: 'bunq',
            entityName: 'bunq B.V.',
            confidence: 'verified',
            total: 125_000,
            excess: 25_000,
            accountIds: [1],
          }),
          guarantee({ accountIds: [2, 3] }),
        ]}
        fmtBase={fmt}
        onReview={noop}
      />,
    );
    expect(markup).toContain('Deposit guarantee review');
    expect(markup).toContain('2 bank accounts need entity review');
  });

  test('explains when a deposit currency is outside scheme coverage', () => {
    const markup = renderToStaticMarkup(
      <DepositGuaranteeNotice
        guarantees={[
          guarantee({
            entityId: 'cba-au',
            entityName: 'Commonwealth Bank of Australia',
            scheme: 'Australian Financial Claims Scheme (AUD deposits only)',
            confidence: 'verified',
            total: 10_000,
            cap: 250_000,
            excess: 10_000,
            ineligibleCurrencyTotal: 10_000,
          }),
        ]}
        fmtBase={fmt}
        onReview={noop}
      />,
    );
    expect(markup).toContain(
      '€10,000 is outside the currencies covered by Australian Financial Claims Scheme (AUD deposits only)',
    );
    expect(markup).not.toContain('is above the modelled');
  });
});
