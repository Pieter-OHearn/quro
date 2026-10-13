import { BarChart2, Building2 } from 'lucide-react';
import { SegmentedControl } from '@/components/ui';
import type { SegmentedControlOption } from '@/components/ui';
import type { Tab } from '../types';

type TabSwitcherProps = {
  tab: Tab;
  onSetTab: (tab: Tab) => void;
};

export function TabSwitcher({ tab, onSetTab }: TabSwitcherProps) {
  const options = [
    {
      value: 'brokerage',
      label: 'Brokerage holdings',
      icon: <BarChart2 size={14} aria-hidden />,
    },
    {
      value: 'property',
      label: 'Property portfolio',
      icon: <Building2 size={14} aria-hidden />,
    },
  ] satisfies readonly SegmentedControlOption<Tab>[];

  return <SegmentedControl options={options} value={tab} onChange={onSetTab} variant="underline" />;
}
