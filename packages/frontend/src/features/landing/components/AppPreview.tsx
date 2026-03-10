import { Check, ChevronRight } from 'lucide-react';
import { QuroLogo } from '@/components/ui';
import { PREVIEW_BARS, PREVIEW_STATS } from '../utils/landing-data';

function AppPreviewChart() {
  return (
    <div className="bg-white/5 rounded-xl p-3">
      <div className="flex items-center justify-between mb-2">
        <p className="text-slate-400 text-[9px] uppercase tracking-wide">Net Worth · 12m</p>
        <span className="text-emerald-400 text-[9px] font-semibold">+34.2%</span>
      </div>
      <div className="flex items-end gap-0.5 h-10">
        {PREVIEW_BARS.map((bar, index) => (
          <div
            key={bar.id}
            className="flex-1 rounded-sm"
            style={{
              height: `${bar.height}%`,
              background:
                index === PREVIEW_BARS.length - 1
                  ? 'linear-gradient(to top, #6366f1, #a78bfa)'
                  : 'rgba(99,102,241,0.3)',
            }}
          />
        ))}
      </div>
      <div className="flex justify-between mt-1.5">
        <span className="text-slate-500 text-[8px]">Mar 25</span>
        <span className="text-slate-500 text-[8px]">Feb 26</span>
      </div>
    </div>
  );
}

function AppPreviewWindow() {
  return (
    <div className="relative bg-[#0e1729] border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
      <div className="flex items-center gap-1.5 px-4 pt-4 pb-3 border-b border-white/5">
        <div className="w-2.5 h-2.5 rounded-full bg-rose-500/70" />
        <div className="w-2.5 h-2.5 rounded-full bg-amber-400/70" />
        <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/70" />
        <div className="flex-1 flex items-center justify-center gap-2 ml-2">
          <QuroLogo size={14} showBg={false} />
          <span className="text-[10px] font-bold text-white/60">Quro · Dashboard</span>
        </div>
      </div>
      <div className="p-4 space-y-3">
        <div className="bg-gradient-to-br from-indigo-600 to-purple-700 rounded-xl p-4">
          <p className="text-indigo-200 text-[10px] font-medium mb-1 uppercase tracking-wider">
            Total Net Worth
          </p>
          <p className="text-white text-2xl font-black tracking-tight">€487,250</p>
          <div className="flex items-center gap-1 mt-1">
            <span className="text-emerald-300 text-[10px] font-semibold">↑ +€12,340</span>
            <span className="text-indigo-300 text-[10px]">this month</span>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {PREVIEW_STATS.map(({ label, value, color }) => (
            <div key={label} className="bg-white/5 rounded-xl p-3">
              <p className="text-slate-400 text-[9px] uppercase tracking-wide mb-1">{label}</p>
              <p className={`text-sm font-bold ${color}`}>{value}</p>
            </div>
          ))}
        </div>
        <AppPreviewChart />
        <div className="flex items-center gap-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-3 py-2.5">
          <div className="w-6 h-6 rounded-lg bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
            <Check size={11} className="text-emerald-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-emerald-300 text-[10px] font-semibold">Budget on track</p>
            <p className="text-slate-400 text-[9px]">68% of monthly budget used</p>
          </div>
          <ChevronRight size={12} className="text-slate-500 flex-shrink-0" />
        </div>
      </div>
    </div>
  );
}

function AppPreviewFloatingBadges() {
  return (
    <>
      <div className="absolute -left-8 top-16 bg-white rounded-2xl shadow-xl px-3 py-2.5 border border-slate-100 hidden lg:block">
        <p className="text-[9px] text-slate-400 mb-0.5">Monthly Salary</p>
        <p className="text-sm font-bold text-slate-800">€4,495</p>
        <p className="text-[9px] text-emerald-500">↑ Take-home</p>
      </div>
      <div className="absolute -right-6 bottom-20 bg-white rounded-2xl shadow-xl px-3 py-2.5 border border-slate-100 hidden lg:block">
        <p className="text-[9px] text-slate-400 mb-0.5">LTV Ratio</p>
        <p className="text-sm font-bold text-slate-800">60.4%</p>
        <p className="text-[9px] text-indigo-500">Good — below 70%</p>
      </div>
    </>
  );
}

export function AppPreview() {
  return (
    <div className="relative w-full max-w-sm mx-auto">
      <div className="absolute -inset-4 bg-indigo-600/20 rounded-3xl blur-2xl" />
      <AppPreviewWindow />
      <AppPreviewFloatingBadges />
    </div>
  );
}
