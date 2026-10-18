import { useNavigate, useSearchParams } from 'react-router';
import { BarChart3 } from 'lucide-react';
import type { ExposureReport } from '@quro/shared';
import {
  Button,
  ContentSection,
  EmptyState,
  LoadingSpinner,
  PageStack,
  StateNotice,
} from '@/components/ui';
import { resolveApiErrorMessage } from '@/lib/api';
import { AllocationCard } from './components/AllocationCard';
import { AssetClassCard, CurrencyCard, SectorCard } from './components/BreakdownCards';
import { ConcentrationNotices } from './components/ConcentrationNotices';
import { CustomiseModal } from './components/CustomiseModal';
import { DataStateNotices } from './components/DataStateNotices';
import { HoldingsCard } from './components/HoldingsCard';
import { MethodPanel } from './components/MethodPanel';
import { SummaryCards } from './components/SummaryCards';
import { useExposure } from './hooks';
import { useExposureFormat, type ExposureFormat } from './useExposureFormat';

const CUSTOMISE_PARAM = 'customise';
const HOLDINGS_ANCHOR = 'exposure-holdings';

function Header({ onCustomise }: Readonly<{ onCustomise: () => void }>) {
  return (
    <ContentSection className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="text-title-section text-fg">Exposure</h2>
        <p className="mt-1 max-w-2xl text-cell text-fg-muted">
          How your brokerage investments are spread by asset class, currency, sector and holding. It
          describes your mix; it is information, not advice.
        </p>
      </div>
      <Button variant="secondary" onClick={onCustomise}>
        Customise
      </Button>
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
      title="No investments to break down yet"
      description="Add a brokerage holding and its shares, and this page shows how they are spread."
      action={{ label: 'Go to Investments', onClick: () => void navigate('/investments') }}
    />
  );
}

/** The Exposure tab of the Plan page: what the brokerage holdings are made of, and how risky. */
export function ExposureTab() {
  const query = useExposure();
  const format = useExposureFormat();
  const [searchParams, setSearchParams] = useSearchParams();
  const customising = searchParams.get(CUSTOMISE_PARAM) === '1';

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
  const { view } = report;
  return (
    <PageStack padding="none">
      <Header onCustomise={() => setCustomising(true)} />
      <DataStateNotices report={report} format={format} onClassify={scrollToHoldings} />
      {view.status === 'ready' ? (
        <Breakdowns report={report} format={format} />
      ) : (
        <NothingToShow status={view.status} />
      )}
      <MethodPanel report={report} />
      {customising ? (
        <CustomiseModal
          settings={report.settings.settings}
          source={report.settings.source}
          onClose={() => setCustomising(false)}
        />
      ) : null}
    </PageStack>
  );
}
