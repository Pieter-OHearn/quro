import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { AllocationCard } from './components/AllocationCard';
import { AssetClassCard, CurrencyCard } from './components/BreakdownCards';
import { ConcentrationNotices } from './components/ConcentrationNotices';
import { DataStateNotices, HouseholdDataNotices } from './components/DataStateNotices';
import { HouseholdMixCard, HouseholdSummary, BrokerageOnlyCard } from './components/HouseholdCards';
import { MethodPanel } from './components/MethodPanel';
import { SummaryCards } from './components/SummaryCards';
import { buildReport, exposureHolding as holding } from './exposureFixture';
import type { ExposureFormat } from './useExposureFormat';

const format: ExposureFormat = {
  money: (value) => `€${value.toFixed(2)}`,
  native: (value, currency) => `${currency} ${value.toFixed(2)}`,
  percent: (value) => `${value.toFixed(1)}%`,
  decimal: (value, digits = 1) => value.toFixed(digits),
};

const ADVICE = /\b(you should|should|buy|sell|recommend(ed|s)? (that )?you)\b/i;

const mixed = buildReport(
  [
    holding({ id: 1, name: 'Global ETF', shares: 40, sector: 'Technology' }),
    holding({ id: 2, name: 'Bond Fund', assetClass: 'bond_long_government', shares: 60 }),
    holding({ id: 3, name: 'Mystery Fund', assetClass: null, shares: 5 }),
  ],
  { selectedMix: 'B' },
);

const household = buildReport(
  [
    holding({ id: 1, name: 'Global ETF', shares: 40 }),
    holding({ id: 2, name: 'Mystery Fund', assetClass: null, shares: 5 }),
  ],
  {
    selectedMix: 'B',
    savingsAccounts: [
      {
        id: 1,
        name: 'Joint Pot',
        bank: 'Example Bank',
        currency: 'EUR',
        balance: 2000,
        isJoint: true,
      },
    ],
    properties: [
      {
        id: 1,
        name: '1 Example Street',
        propertyType: 'Primary Residence',
        currency: 'EUR',
        currentValue: 9000,
        isJoint: false,
        mortgage: null,
      },
      {
        id: 2,
        name: '2 Underwater Court',
        propertyType: 'Buy-to-Let',
        currency: 'USD',
        currentValue: 1000,
        isJoint: false,
        mortgage: { id: 7, outstandingBalance: 2000, isJoint: false },
      },
    ],
  },
);

describe('the Overview', () => {
  test('the summary states the total and the three figures it is made of', () => {
    const markup = renderToStaticMarkup(
      <HouseholdSummary view={household.household} format={format} />,
    );
    expect(markup).toContain('Property is 62.1% of your assets.');
    expect(markup).toContain('€13600.00');
    expect(markup).toContain('Brokerage');
    expect(markup).toContain('€4500.00');
    expect(markup).toContain('Savings accounts');
    expect(markup).toContain('€1000.00');
    expect(markup).toContain('Property equity');
    expect(markup).toContain('€8100.00');
    expect(markup).toContain('pensions not included');
    expect(markup).not.toMatch(ADVICE);
  });

  test('the mix has a Property group, no reference range and says what Cash holds', () => {
    const markup = renderToStaticMarkup(
      <HouseholdMixCard view={household.household} format={format} />,
    );
    expect(markup).toContain('Overview by group: Stocks');
    expect(markup).toContain('Property');
    expect(markup).toContain('Cash is your savings accounts plus any cash funds');
    expect(markup).not.toContain('Compared with Reference mix');
    expect(markup).not.toContain('Within the range');
    expect(markup).not.toMatch(ADVICE);
  });

  test('negative equity is listed apart and the sum shows it coming off the total', () => {
    const markup = renderToStaticMarkup(
      <HouseholdMixCard view={household.household} format={format} />,
    );
    expect(markup).toContain('Not in the bar, taken off the total');
    expect(markup).toContain('2 Underwater Court');
    expect(markup).toContain('Negative equity');
    expect(markup).toContain('USD -1000.00');
    expect(markup).toContain('€14500.00');
    expect(markup).toContain('€-900.00');
    expect(markup).toContain('€13600.00');
  });

  test('without a negative position there is no list', () => {
    const report = buildReport([holding({ id: 1 })]);
    const markup = renderToStaticMarkup(
      <HouseholdMixCard view={report.household} format={format} />,
    );
    expect(markup).not.toContain('taken off the total');
  });

  test('by currency names the positions, not only holdings', () => {
    const markup = renderToStaticMarkup(
      <CurrencyCard
        view={household.household}
        format={format}
        subject="Overview by currency"
        subtitle="The currency each holding, account and property is in"
      />,
    );
    expect(markup).toContain('The currency each holding, account and property is in');
    expect(markup).toContain('EUR');
  });

  test('brokerage-only figures are labelled and link to the Brokerage view', () => {
    const markup = renderToStaticMarkup(
      <BrokerageOnlyCard view={household.view} format={format} onOpenBrokerage={() => undefined} />,
    );
    expect(markup).toContain('Brokerage only');
    expect(markup).toContain('Weighted average risk class');
    expect(markup).toContain('Effective number of holdings');
    expect(markup).toContain('Concentration notices');
    expect(markup).toContain('Open Brokerage');
  });

  test('without holdings the card only points at the Brokerage view', () => {
    const report = buildReport([]);
    const markup = renderToStaticMarkup(
      <BrokerageOnlyCard view={report.view} format={format} onOpenBrokerage={() => undefined} />,
    );
    expect(markup).not.toContain('Weighted average risk class');
    expect(markup).toContain('Open Brokerage');
  });

  test('names what is left out, the stale rates and the unclassified holdings', () => {
    const report = buildReport([holding({ id: 1, currency: 'USD', assetClass: null })], {
      stale: true,
      savingsAccounts: [
        {
          id: 1,
          name: 'Swiss Pot',
          bank: 'Example Bank',
          currency: 'CHF',
          balance: 100,
          isJoint: false,
        },
      ],
    });
    const markup = renderToStaticMarkup(
      <HouseholdDataNotices report={report} onClassify={() => undefined} />,
    );
    expect(markup).toContain('1 item is left out of the figures');
    expect(markup).toContain('Swiss Pot (account, CHF) has no stored exchange rate');
    expect(markup).toContain('Exchange rates are out of date');
    expect(markup).toContain('1 holding is unclassified');
  });

  test('the method says what each view counts, on Overview without the brokerage detail', () => {
    const markup = renderToStaticMarkup(<MethodPanel report={household} view="overview" />);
    expect(markup).toContain('What each view counts');
    expect(markup).toContain('Pensions are not');
    expect(markup).toContain('value less its linked mortgage');
    expect(markup).toContain('counts at 50%');
    expect(markup).toContain('listed under the bar and taken off the total');
    expect(markup).toContain('Information, not advice.');
    expect(markup).not.toContain('Concentration notices above');
    expect(markup).not.toContain('Reference mix A');
    expect(markup).not.toMatch(/\byou should\b/i);
  });
});

describe('exposure summary', () => {
  test('states the largest group in plain words and the risk class on the 1 to 7 scale', () => {
    const markup = renderToStaticMarkup(<SummaryCards view={mixed.view} format={format} />);
    expect(markup).toContain('Bonds are 57.1% of your brokerage.');
    expect(markup).toContain('Weighted average risk class');
    expect(markup).toContain('of 7');
    expect(markup).toContain('Effective number of holdings');
    expect(markup).not.toMatch(ADVICE);
  });

  test('says when no holding has a risk class', () => {
    const report = buildReport([holding({ id: 1, assetClass: null })]);
    const markup = renderToStaticMarkup(<SummaryCards view={report.view} format={format} />);
    expect(markup).toContain('Not available');
    expect(markup).toContain('No holding has a risk class yet.');
  });
});

describe('exposure allocation chart', () => {
  test('carries a text alternative with every share and the reference comparison', () => {
    const markup = renderToStaticMarkup(<AllocationCard view={mixed.view} format={format} />);
    expect(markup).toContain('Brokerage by group: Stocks');
    expect(markup).toContain('Show values');
    expect(markup).toContain('Compared with Reference mix B');
    expect(markup).toContain('Above the range');
    expect(markup).toContain('Unclassified');
    expect(markup).not.toMatch(ADVICE);
  });

  test('says Cash means cash funds in the brokerage, not savings accounts', () => {
    const markup = renderToStaticMarkup(<AllocationCard view={mixed.view} format={format} />);
    expect(markup).toContain('Cash here means cash funds in your brokerage, not savings accounts');
  });

  test('draws no range when no reference mix is selected', () => {
    const report = buildReport([holding({ id: 1 })]);
    const markup = renderToStaticMarkup(<AllocationCard view={report.view} format={format} />);
    expect(markup).not.toContain('Compared with Reference mix');
  });

  test('asset class rows list the unclassified bucket with its holding count', () => {
    const markup = renderToStaticMarkup(<AssetClassCard view={mixed.view} format={format} />);
    expect(markup).toContain('Unclassified');
    expect(markup).toContain('1 holding');
    expect(markup).toContain('Asset class');
  });
});

describe('exposure notices', () => {
  test('concentration notices are info notices that state a figure and a threshold', () => {
    const report = buildReport([
      holding({ id: 1, name: 'Big Fund', shares: 90 }),
      holding({ id: 2, shares: 10 }),
    ]);
    const markup = renderToStaticMarkup(<ConcentrationNotices notices={report.view.notices} />);
    expect(markup).toContain('Big Fund holds 90% of your brokerage');
    expect(markup).toContain('role="status"');
    expect(markup).not.toMatch(ADVICE);
  });

  test('renders nothing without a notice', () => {
    expect(renderToStaticMarkup(<ConcentrationNotices notices={[]} />)).toBe('');
  });

  test('names holdings that could not be valued and does not call the page empty', () => {
    const report = buildReport([
      holding({ id: 1 }),
      holding({ id: 2, name: 'Swiss One', currency: 'CHF' }),
      holding({ id: 3, name: 'No Price', unitPrice: null }),
    ]);
    const markup = renderToStaticMarkup(
      <DataStateNotices report={report} format={format} onClassify={() => undefined} />,
    );
    expect(markup).toContain('2 holdings are left out of the figures');
    expect(markup).toContain('Swiss One (CHF) has no stored exchange rate');
    expect(markup).toContain('No Price (EUR) has no usable price');
    expect(markup).toContain('guess');
  });

  test('flags a stale price, a stale rate and unclassified holdings', () => {
    const report = buildReport(
      [
        holding({ id: 1, name: 'Old Price', priceStale: true }),
        holding({ id: 2, currency: 'USD', assetClass: null }),
      ],
      { stale: true },
    );
    const markup = renderToStaticMarkup(
      <DataStateNotices report={report} format={format} onClassify={() => undefined} />,
    );
    expect(markup).toContain('Some prices have not synced for over a week');
    expect(markup).toContain('Exchange rates are out of date');
    expect(markup).toContain('1 holding is unclassified');
    expect(markup).toContain('Classify holdings');
  });

  test('shows nothing when the data is sound and classified', () => {
    const report = buildReport([holding({ id: 1 })]);
    const markup = renderToStaticMarkup(
      <DataStateNotices report={report} format={format} onClassify={() => undefined} />,
    );
    expect(markup).not.toContain('role=');
  });

  test('says so when the saved settings could not be read', () => {
    const report = buildReport([holding({ id: 1 })]);
    report.settings.storedInvalid = true;
    const markup = renderToStaticMarkup(
      <DataStateNotices report={report} format={format} onClassify={() => undefined} />,
    );
    expect(markup).toContain('Your saved settings could not be read');
  });
});

describe('how this is worked out', () => {
  const markup = renderToStaticMarkup(<MethodPanel report={mixed} />);

  test('states the rules of both views on Brokerage too', () => {
    expect(markup).toContain('What each view counts');
  });

  test('shows the formula, the defaults in use, their sources and version dates', () => {
    expect(markup).toContain('Effective number of holdings = 1 ÷');
    expect(markup).toContain('Reference mix B');
    expect(markup).toContain('Sources and version dates');
    expect(markup).toContain('Published source');
    expect(markup).toContain('Our assumption');
    expect(markup).toContain('2026-10-18');
    expect(markup).toContain('Method exposure-breakdown 1.0.0');
  });

  test('lists the currency notice as off by default, with its threshold', () => {
    expect(markup).toContain('One currency outside EUR');
    expect(markup).toContain('Off (50%)');
  });

  test('says it is information, not advice, and never names a mix after risk tolerance', () => {
    expect(markup).toContain('Information, not advice.');
    expect(markup).toMatch(
      /Reference mix A[\s\S]*Reference mix B[\s\S]*Reference mix C[\s\S]*Reference mix D/,
    );
    expect(markup).not.toMatch(/Reference mix (conservative|moderate|growth|aggressive)/i);
    expect(markup).not.toMatch(/\byou should\b/i);
  });
});
