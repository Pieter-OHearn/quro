import type { PensionFormatBaseFn } from '../types';

type PensionRetirementProjectionProps = {
  totalInBase: number;
  projected: number | null;
  monthlyDrawdown: number | null;
  yearsToRetirement: number | null;
  retirementYearsInput: string;
  onRetirementYearsChange: (value: string) => void;
  fmtBase: PensionFormatBaseFn;
  baseCurrency: string;
};

export function PensionRetirementProjection({
  totalInBase,
  projected,
  monthlyDrawdown,
  yearsToRetirement,
  retirementYearsInput,
  onRetirementYearsChange,
  fmtBase,
  baseCurrency,
}: Readonly<PensionRetirementProjectionProps>) {
  const items = [
    { label: 'Current Total', value: fmtBase(totalInBase), note: `in ${baseCurrency}` },
    {
      label: 'Years to Retirement',
      value: yearsToRetirement == null ? '—' : `${yearsToRetirement} years`,
      note: yearsToRetirement == null ? 'Enter horizon below' : 'User-defined horizon',
    },
    {
      label: 'Projected Value',
      value: projected == null ? '—' : fmtBase(projected),
      note: projected == null ? 'Awaiting horizon' : 'Based on current trend',
    },
    {
      label: 'Est. Monthly Income',
      value: monthlyDrawdown == null ? '—' : fmtBase(monthlyDrawdown),
      note: monthlyDrawdown == null ? 'Awaiting horizon' : 'Over 25-year drawdown',
    },
  ];

  return (
    <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-2xl p-6 border border-amber-100">
      <h3 className="font-semibold text-slate-900 mb-4">Retirement Projection</h3>
      <div className="mb-4 max-w-xs">
        <label className="block text-xs font-semibold text-slate-600 mb-1.5">
          Years to Retirement
        </label>
        <input
          type="number"
          min="1"
          value={retirementYearsInput}
          onChange={(event) => onRetirementYearsChange(event.target.value)}
          placeholder="e.g. 25"
          className="w-full rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300"
        />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {items.map(({ label, value, note }) => (
          <div key={label} className="bg-white/80 rounded-xl p-4">
            <p className="text-xs text-slate-500 mb-1">{label}</p>
            <p className="font-bold text-amber-700">{value}</p>
            <p className="text-[10px] text-slate-400 mt-0.5">{note}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
