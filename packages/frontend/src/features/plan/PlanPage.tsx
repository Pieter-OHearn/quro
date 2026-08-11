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
import { EmploymentCard } from '@/features/employment';
import { useCurrency } from '@/lib/CurrencyContext';
import {
  AssumptionsDrawer,
  BankingEntityReviewModal,
  BurnRateCards,
  CalculationReviewModal,
  CategoryClassificationCard,
  DepositGuaranteeNotice,
  LiquidityTierBar,
  RunwayHeroCard,
  RunwayLedgerChart,
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

// The page intentionally keeps its section order and modal state together for readability.
// eslint-disable-next-line max-lines-per-function
export function Plan() {
  const runwayQuery = useRunway();
  const assumptionsQuery = usePlanAssumptions();
  const { fmtBase } = useCurrency();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [bankingReviewOpen, setBankingReviewOpen] = useState(false);

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
      <EmploymentCard employment={data.employment.primary} asOf={data.asOf} />
      <CategoryClassificationCard defaultedCount={data.burn.unclassifiedCategoryCount} />
      <ContentSection spacing="lg">
        <RunwayHeroCard data={data} onReview={() => setReviewOpen(true)} />
        <BurnRateCards burn={data.burn} fmtBase={(value) => fmtBase(value)} />
      </ContentSection>
      <ContentSection spacing="lg" className="grid gap-6 xl:grid-cols-2">
        <LiquidityTierBar tiers={data.tiers} fmtBase={(value) => fmtBase(value)} />
        <RunwayLedgerChart ledger={data.runway.ledger} fmtBase={(value) => fmtBase(value)} />
      </ContentSection>
      <DepositGuaranteeNotice
        guarantees={data.depositGuarantee}
        fmtBase={(value) => fmtBase(value)}
        onReview={() => setBankingReviewOpen(true)}
      />
      {data.incomeSupport.unemployment.status === 'unknown' ? (
        <p className="text-xs leading-5 text-slate-500">
          WW is not included yet: {data.incomeSupport.unemployment.reason}
        </p>
      ) : null}
      <p className="text-xs leading-5 text-slate-400">{RUNWAY_CITATIONS.advice}</p>
      <AssumptionsDrawer
        open={drawerOpen}
        assumptions={assumptionsQuery.data ?? null}
        onClose={() => setDrawerOpen(false)}
      />
      {reviewOpen ? (
        <CalculationReviewModal
          data={data}
          fmtBase={(value) => fmtBase(value)}
          onClose={() => setReviewOpen(false)}
        />
      ) : null}
      {bankingReviewOpen ? (
        <BankingEntityReviewModal
          guarantees={data.depositGuarantee}
          onClose={() => setBankingReviewOpen(false)}
        />
      ) : null}
    </PageStack>
  );
}
