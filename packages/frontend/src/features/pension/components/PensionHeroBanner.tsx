import { ShieldCheck } from 'lucide-react';
import type { PensionPot } from '@quro/shared';
import type { PensionFormatBaseFn } from '../types';

type PensionHeroBannerProps = {
  pensions: PensionPot[];
  totalInBase: number;
  projected: number | null;
  yearsToRetirement: number | null;
  fmtBase: PensionFormatBaseFn;
  baseCurrency: string;
};

export function PensionHeroBanner({
  pensions,
  totalInBase,
  projected,
  yearsToRetirement,
  fmtBase,
  baseCurrency,
}: Readonly<PensionHeroBannerProps>) {
  return (
    <div className="rounded-2xl bg-gradient-to-r from-[#0a0f1e] via-[#16213e] to-[#1a1448] p-6 text-white relative overflow-hidden">
      <div className="absolute top-0 right-0 w-56 h-56 bg-amber-500/10 rounded-full -translate-y-1/3 translate-x-1/4" />
      <div className="absolute bottom-0 right-32 w-32 h-32 bg-indigo-500/10 rounded-full translate-y-1/2" />
      <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <ShieldCheck size={18} className="text-amber-400" />
            <p className="text-amber-300 text-sm">Retirement Planning</p>
          </div>
          <h2 className="text-2xl font-bold">Pension Tracker</h2>
          <p className="text-slate-400 text-sm mt-1">
            {pensions.length} pension pots across{' '}
            {new Set(pensions.map((pot) => pot.currency)).size} currencies
          </p>
        </div>
        <div className="flex gap-3">
          <div className="bg-white/10 backdrop-blur-sm rounded-2xl px-5 py-4 text-center">
            <p className="text-amber-300 text-[10px] uppercase tracking-widest mb-1">
              Total Balance
            </p>
            <p className="text-2xl font-bold">{fmtBase(totalInBase)}</p>
            <p className="text-slate-400 text-xs mt-0.5">in {baseCurrency}</p>
          </div>
          <div className="bg-white/10 backdrop-blur-sm rounded-2xl px-5 py-4 text-center">
            <p className="text-amber-300 text-[10px] uppercase tracking-widest mb-1">
              {yearsToRetirement == null ? 'Projection' : `In ${yearsToRetirement} Years`}
            </p>
            <p className="text-2xl font-bold">{projected == null ? '—' : fmtBase(projected)}</p>
            <p className="text-slate-400 text-xs mt-0.5">
              {projected == null ? 'Set retirement horizon below' : 'Projected from current data'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
