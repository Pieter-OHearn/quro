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
      label: 'Brokerage Holdings',
      icon: <BarChart2 size={16} />,
    },
    {
      value: 'property',
      label: 'Property Portfolio',
      icon: <Building2 size={16} />,
    },
  ] satisfies readonly SegmentedControlOption<Tab>[];

  return <SegmentedControl options={options} value={tab} onChange={onSetTab} variant="underline" />;
}
