import { useNavigate, useSearchParams } from 'react-router';
import { BarChart3 } from 'lucide-react';
import type { ExposureReport } from '@quro/shared';
import {
  Button,
  ContentSection,
  EmptyState,
  LoadingSpinner,
  PageStack,
  SegmentedControl,
  StateNotice,
  ModalPresence,
} from '@/components/ui';
import { resolveApiErrorMessage } from '@/lib/api';
import { AllocationCard } from './components/AllocationCard';
import { AssetClassCard, CurrencyCard, SectorCard } from './components/BreakdownCards';
import { ConcentrationNotices } from './components/ConcentrationNotices';
import { CustomiseModal } from './components/CustomiseModal';
import { DataStateNotices, HouseholdDataNotices } from './components/DataStateNotices';
import { HoldingsCard } from './components/HoldingsCard';
import { HouseholdMixCard, HouseholdSummary, BrokerageOnlyCard } from './components/HouseholdCards';
import { MethodPanel } from './components/MethodPanel';
import { SummaryCards } from './components/SummaryCards';
import {
  DEFAULT_EXPOSURE_VIEW,
  EXPOSURE_VIEWS,
  resolveExposureView,
  type ExposureViewKey,
} from './exposureViews';
import { useExposure } from './hooks';
import { useExposureFormat, type ExposureFormat } from './useExposureFormat';

const VIEW_PARAM = 'view';
const CUSTOMISE_PARAM = 'customise';
const HOLDINGS_ANCHOR = 'exposure-holdings';

const VIEW_INTRO: Record<ExposureViewKey, string> = {
  overview:
    'What you own across your brokerage, savings accounts and property, at your share. Pensions are not included. It describes your mix; it is information, not advice.',
  brokerage:
    'How your brokerage holdings are spread by asset class, currency, sector and holding. It describes your mix; it is information, not advice.',
};

function Header({
  view,
  onViewChange,
  onCustomise,
}: Readonly<{
  view: ExposureViewKey;
  onViewChange: (view: ExposureViewKey) => void;
  onCustomise: () => void;
}>) {
  return (
    <ContentSection className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0 flex-1 basis-80">
        <h2 className="text-title-section text-fg">Exposure</h2>
        <p className="mt-1 max-w-2xl text-cell text-fg-muted">{VIEW_INTRO[view]}</p>
      </div>
      <div className="flex items-center gap-2 max-sm:w-full max-sm:flex-col max-sm:items-stretch">
        <SegmentedControl
          aria-label="What Exposure counts"
          options={EXPOSURE_VIEWS}
          value={view}
          onChange={onViewChange}
        />
        {view === 'brokerage' ? (
          <Button variant="secondary" onClick={onCustomise}>
            Customise
          </Button>
        ) : null}
      </div>
    </ContentSection>
  );
}

function scrollToHoldings() {
  const target = document.getElementById(HOLDINGS_ANCHOR);
  target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function Breakdowns({
  report,
  format,
}: Readonly<{ report: ExposureReport; format: ExposureFormat }>) {
  const { view } = report;
  return (
    <>
      <SummaryCards view={view} format={format} />
      <AllocationCard view={view} format={format} />
      <ConcentrationNotices notices={view.notices} />
      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <AssetClassCard view={view} format={format} />
        <CurrencyCard view={view} format={format} />
        <SectorCard view={view} format={format} />
      </div>
      <div id={HOLDINGS_ANCHOR} className="scroll-mt-4">
        <HoldingsCard view={view} format={format} />
      </div>
    </>
  );
}

function OverviewCards({
  report,
  format,
  onOpenBrokerage,
}: Readonly<{ report: ExposureReport; format: ExposureFormat; onOpenBrokerage: () => void }>) {
  const { household, view } = report;
  return (
    <>
      <HouseholdSummary view={household} format={format} />
      <HouseholdMixCard view={household} format={format} />
      <div className="grid gap-4 lg:grid-cols-2">
        <CurrencyCard
          view={household}
          format={format}
          subject="Overview by currency"
          subtitle="The currency each holding, account and property is in"
          footer={
            household.negative.length > 0 ? (
              <p className="mt-3 text-caption text-fg-subtle">
                Positions below zero are in no currency share.
              </p>
            ) : undefined
          }
        />
        <BrokerageOnlyCard view={view} format={format} onOpenBrokerage={onOpenBrokerage} />
      </div>
    </>
  );
}

function NothingCounted({ status }: Readonly<{ status: 'empty' | 'unvaluable' }>) {
  return status === 'unvaluable' ? (
    <EmptyState
      icon={BarChart3}
      tone="neutral"
      title="Nothing could be valued"
      description="Each item is missing a price or an exchange rate, so there is nothing to total yet."
    />
  ) : (
    <EmptyState
      icon={BarChart3}
      title="Nothing to add up yet"
      description="Add a savings account, a property or a brokerage holding, and this page shows how they are spread."
    />
  );
}

function OverviewView({
  report,
  format,
  onOpenBrokerage,
}: Readonly<{ report: ExposureReport; format: ExposureFormat; onOpenBrokerage: () => void }>) {
  return (
    <>
      <HouseholdDataNotices report={report} onClassify={onOpenBrokerage} />
      {report.household.status === 'ready' ? (
        <OverviewCards report={report} format={format} onOpenBrokerage={onOpenBrokerage} />
      ) : (
        <NothingCounted status={report.household.status} />
      )}
    </>
  );
}

function BrokerageView({
  report,
  format,
}: Readonly<{ report: ExposureReport; format: ExposureFormat }>) {
  return (
    <>
      <DataStateNotices report={report} format={format} onClassify={scrollToHoldings} />
      {report.view.status === 'ready' ? (
        <Breakdowns report={report} format={format} />
      ) : (
        <NothingToShow status={report.view.status} />
      )}
    </>
  );
}

function NothingToShow({ status }: Readonly<{ status: 'empty' | 'unvaluable' }>) {
  const navigate = useNavigate();
  if (status === 'unvaluable') {
    return (
      <EmptyState
        icon={BarChart3}
        tone="neutral"
        title="None of your holdings could be valued"
        description="Each one is missing a price or an exchange rate, so there is nothing to total yet."
      />
    );
  }
  return (
    <EmptyState
      icon={BarChart3}
      title="No holdings to break down yet"
      description="Add a brokerage holding and its shares, and this page shows how they are spread."
      action={{ label: 'Go to Investments', onClick: () => void navigate('/investments') }}
    />
  );
}

/**
 * The Exposure tab of the Plan page. Overview adds up what the person owns; Brokerage is what
 * the brokerage holdings are made of, and how risky. The URL names the view (`?view=brokerage`).
 */
export function ExposureTab() {
  const query = useExposure();
  const format = useExposureFormat();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeView = resolveExposureView(searchParams.get(VIEW_PARAM));
  const customising = searchParams.get(CUSTOMISE_PARAM) === '1';

  const selectView = (next: ExposureViewKey) =>
    setSearchParams((previous) => {
      const params = new URLSearchParams(previous);
      if (next === DEFAULT_EXPOSURE_VIEW) params.delete(VIEW_PARAM);
      else params.set(VIEW_PARAM, next);
      return params;
    });

  const setCustomising = (open: boolean) =>
    setSearchParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        if (open) next.set(CUSTOMISE_PARAM, '1');
        else next.delete(CUSTOMISE_PARAM);
        return next;
      },
      { replace: !open },
    );

  if (query.isPending)
    return <LoadingSpinner className="min-h-[40vh]" label="Working out exposure" />;
  if (query.isError) {
    return (
      <StateNotice
        tone="danger"
        title="Exposure could not be loaded"
        testId="exposure-load-error"
        action={{
          label: 'Try again',
          onClick: () => void query.refetch(),
          loading: query.isRefetching,
        }}
      >
        {resolveApiErrorMessage(
          query.error,
          'Your investments are unchanged; the page could not be built.',
        )}
      </StateNotice>
    );
  }

  const report = query.data;
  return (
    <PageStack padding="none">
      <Header
        view={activeView}
        onViewChange={selectView}
        onCustomise={() => setCustomising(true)}
      />
      {activeView === 'overview' ? (
        <OverviewView
          report={report}
          format={format}
          onOpenBrokerage={() => selectView('brokerage')}
        />
      ) : (
        <BrokerageView report={report} format={format} />
      )}
      <MethodPanel report={report} view={activeView} />
      <ModalPresence open={customising}>
        {customising ? (
          <CustomiseModal
            settings={report.settings.settings}
            source={report.settings.source}
            onClose={() => setCustomising(false)}
          />
        ) : null}
      </ModalPresence>
    </PageStack>
  );
}
