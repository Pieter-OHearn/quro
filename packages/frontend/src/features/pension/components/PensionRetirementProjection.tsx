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
    { label: 'Current Total', value: fmtBase(totalInBase), note: `in ${baseCurrency}` },
    {
      label: 'Years to Retirement',
      value: yearsToRetirement == null ? '—' : `${yearsToRetirement} years`,
      note:
        yearsToRetirement == null ? 'Update your profile settings' : 'Calculated from your profile',
    },
    {
      label: 'Projected Value',
      value: projected == null ? '—' : fmtBase(projected),
      note: projected == null ? 'Needs profile retirement data' : 'Based on current trend',
    },
    {
      label: 'Est. Monthly Income',
      value: monthlyDrawdown == null ? '—' : fmtBase(monthlyDrawdown),
      note: monthlyDrawdown == null ? 'Needs profile retirement data' : 'Over 25-year drawdown',
    },
  ];

  return (
    <div className="bg-gradient-to-br from-warning-soft to-accent-warm-soft rounded-2xl p-6 border border-warning-soft-strong">
      <h3 className="font-semibold text-fg mb-4">Retirement Projection</h3>
      <div className="mb-4 rounded-xl border border-warning-border bg-surface/80 px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-warning-fg">
          Profile Retirement Target
        </p>
        <p className="mt-1 text-sm text-fg-muted">
          {currentAge == null || targetRetirementAge == null
            ? 'Set your current age and target retirement age in Settings.'
            : `Using age ${currentAge} and retirement age ${targetRetirementAge} from your profile.`}
        </p>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {items.map(({ label, value, note }) => (
          <div key={label} className="bg-surface/80 rounded-xl p-4">
            <p className="text-xs text-fg-subtle mb-1">{label}</p>
            <p className="font-bold text-warning-fg">{value}</p>
            <p className="text-[10px] text-fg-faint mt-0.5">{note}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
