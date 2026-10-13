import { Card, PanelHeader } from '@/components/ui';
import type { PensionFormatBaseFn } from '../types';

type PensionRetirementProjectionProps = {
  totalInBase: number;
  projected: number | null;
  monthlyDrawdown: number | null;
  yearsToRetirement: number | null;
  currentAge: number | null;
  targetRetirementAge: number | null;
  fmtBase: PensionFormatBaseFn;
  baseCurrency: string;
};

export function PensionRetirementProjection({
  totalInBase,
  projected,
  monthlyDrawdown,
  yearsToRetirement,
  currentAge,
  targetRetirementAge,
  fmtBase,
  baseCurrency,
}: Readonly<PensionRetirementProjectionProps>) {
  const items = [
    { label: 'Current total', value: fmtBase(totalInBase), note: `in ${baseCurrency}` },
    {
      label: 'Years to retirement',
      value: yearsToRetirement == null ? '—' : `${yearsToRetirement} years`,
      note:
        yearsToRetirement == null ? 'Update your profile settings' : 'Calculated from your profile',
    },
    {
      label: 'Projected value',
      value: projected == null ? '—' : fmtBase(projected),
      note: projected == null ? 'Needs profile retirement data' : 'Based on current trend',
    },
    {
      label: 'Est. monthly income',
      value: monthlyDrawdown == null ? '—' : fmtBase(monthlyDrawdown),
      note: monthlyDrawdown == null ? 'Needs profile retirement data' : 'Over 25-year drawdown',
    },
  ];

  return (
    <Card padding="none">
      <PanelHeader
        title="Retirement projection"
        subtitle={
          currentAge == null || targetRetirementAge == null
            ? 'Profile retirement target: set your current age and target retirement age in Settings.'
            : `Profile retirement target: using age ${currentAge} and retirement age ${targetRetirementAge} from your profile.`
        }
      />
      <dl className="grid grid-cols-2 gap-4 p-4 sm:grid-cols-4">
        {items.map(({ label, value, note }) => (
          <div key={label} className="min-w-0">
            <dt className="text-label text-fg-muted">{label}</dt>
            <dd className="text-figure-md text-fg">{value}</dd>
            <dd className="text-caption text-fg-subtle">{note}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}
