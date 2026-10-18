import { useSearchParams } from 'react-router';
import { PageStack, SegmentedControl, segmentedPanelId, segmentedTabId } from '@/components/ui';
import { ExposureTab } from './exposure';
import { PLAN_TABS, resolvePlanTab, type PlanTab } from './planTabs';
import { RunwayTab } from './RunwayTab';

/** Ties the tab strip to the panel below it. */
const PLAN_TABS_ID = 'plan-tabs';

// The URL names the tab (`?tab=exposure`), so a tab can be linked to and the back button leaves it.
// Switching tabs drops the parameters of the tab it leaves.
export function Plan() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = resolvePlanTab(searchParams.get('tab'));

  const selectTab = (tab: PlanTab) => setSearchParams({ tab });

  return (
    <PageStack>
      <SegmentedControl
        aria-label="Plan sections"
        variant="underline"
        tabsId={PLAN_TABS_ID}
        options={PLAN_TABS}
        value={activeTab}
        onChange={selectTab}
        className="overflow-x-auto"
        buttonClassName="flex-none max-sm:flex-1"
      />
      <div
        role="tabpanel"
        id={segmentedPanelId(PLAN_TABS_ID, activeTab)}
        aria-labelledby={segmentedTabId(PLAN_TABS_ID, activeTab)}
      >
        {activeTab === 'runway' ? <RunwayTab /> : null}
        {activeTab === 'exposure' ? <ExposureTab /> : null}
      </div>
    </PageStack>
  );
}
