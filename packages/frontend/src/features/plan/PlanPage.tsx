import { useState } from 'react';
import {
  Badge,
  Button,
  ContentSection,
  LoadingSpinner,
  PageStack,
  SegmentedControl,
} from '@/components/ui';
import { RouteQueryErrorState } from '@/components/errors/RouteQueryErrorState';
import { useCurrency } from '@/lib/CurrencyContext';
import {
  AssumptionsDrawer,
  BurnRateCards,
  CategoryClassificationCard,
  DepositGuaranteeNotice,
  LiquidityTierBar,
  RunwayHeroCard,
  RunwayLedgerChart,
  RunwaySetupCard,
} from './components';
import { usePlanAssumptions, useRunway } from './hooks';
import { RUNWAY_CITATIONS } from './utils/runway-display';

const PLAN_SECTIONS = [
  { value: 'runway', label: 'Runway' },
  {
    value: 'exposure',
    label: 'Exposure',
    badge: <Badge tone="neutral">Soon</Badge>,
    disabled: true,
  },
  {
    value: 'year-ahead',
    label: 'Year ahead',
    badge: <Badge tone="neutral">Soon</Badge>,
    disabled: true,
  },
] as const;

export function Plan() {
  const runwayQuery = useRunway();
  const assumptionsQuery = usePlanAssumptions();
  const { fmtBase } = useCurrency();
  const [drawerOpen, setDrawerOpen] = useState(false);

  if (runwayQuery.isPending || assumptionsQuery.isPending) {
    return <LoadingSpinner className="min-h-[60vh]" label="Building runway plan" />;
  }
  const failedQueries = [
    { label: 'runway plan', ...runwayQuery },
    { label: 'plan assumptions', ...assumptionsQuery },
  ].filter((query) => query.isError);
  if (failedQueries.length > 0) {
    return <RouteQueryErrorState routeName="Plan" failedQueries={failedQueries} />;
  }
  const data = runwayQuery.data;
  if (!data) return null;

  return (
    <PageStack as="main">
      <ContentSection className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-indigo-600">Plan</p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-950">
            Financial resilience
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            A derived planning view built from the balances, spending, and income already in Quro.
          </p>
        </div>
        <Button variant="ghost" onClick={() => setDrawerOpen(true)}>
          Advanced assumptions
        </Button>
      </ContentSection>
      <SegmentedControl
        options={PLAN_SECTIONS}
        value="runway"
        onChange={() => undefined}
        variant="contained"
      />
      {!data.setupComplete ? <RunwaySetupCard /> : null}
      <CategoryClassificationCard defaultedCount={data.burn.unclassifiedCategoryCount} />
      <ContentSection spacing="lg">
        <RunwayHeroCard data={data} />
        <BurnRateCards burn={data.burn} fmtBase={(value) => fmtBase(value)} />
      </ContentSection>
      <ContentSection spacing="lg" className="grid gap-6 xl:grid-cols-2">
        <LiquidityTierBar tiers={data.tiers} fmtBase={(value) => fmtBase(value)} />
        <RunwayLedgerChart ledger={data.runway.ledger} fmtBase={(value) => fmtBase(value)} />
      </ContentSection>
      <DepositGuaranteeNotice
        guarantees={data.depositGuarantee}
        fmtBase={(value) => fmtBase(value)}
      />
      {data.incomeSupport?.eligibility.confidence === 'assumed' ? (
        <p className="text-xs leading-5 text-slate-500">
          Benefit eligibility assumes:{' '}
          {data.incomeSupport.eligibility.unverifiedConditions.join('; ')}.
        </p>
      ) : null}
      <p className="text-xs leading-5 text-slate-400">{RUNWAY_CITATIONS.advice}</p>
      <AssumptionsDrawer
        open={drawerOpen}
        assumptions={assumptionsQuery.data ?? null}
        onClose={() => setDrawerOpen(false)}
      />
    </PageStack>
  );
}
