import { QuroLogo } from '@/components/ui';
import { SectionHeader } from './SectionHeader';

export function WordmarkSection() {
  return (
    <section>
      <SectionHeader title="Wordmark" sub="Mark paired with the logotype — two lockup sizes" />
      <div className="grid sm:grid-cols-2 gap-4 mt-6">
        <div className="rounded-2xl bg-[#0d1627] p-8 flex items-center gap-4 shadow-lg shadow-black/20">
          <QuroLogo size={52} showBg={false} />
          <div>
            <p className="text-2xl font-black tracking-tight text-white leading-none">Quro</p>
            <p className="text-[10px] text-indigo-400 tracking-[0.25em] uppercase mt-0.5">
              Finance
            </p>
          </div>
        </div>
        <div className="rounded-2xl bg-white border border-slate-100 p-8 flex items-center gap-4 shadow-sm">
          <QuroLogo size={52} showBg inverted={false} />
          <div>
            <p className="text-2xl font-black tracking-tight text-slate-900 leading-none">Quro</p>
            <p className="text-[10px] text-indigo-500 tracking-[0.25em] uppercase mt-0.5">
              Finance
            </p>
          </div>
        </div>
      </div>
      <div className="mt-4 grid sm:grid-cols-2 gap-4">
        <div className="rounded-2xl bg-[#0d1627] p-6 flex items-center gap-3 shadow-lg shadow-black/20">
          <QuroLogo size={32} showBg={false} />
          <span className="text-sm font-bold tracking-tight text-white">Quro</span>
        </div>
        <div className="rounded-2xl bg-white border border-slate-100 p-6 flex items-center gap-3 shadow-sm">
          <QuroLogo size={32} showBg />
          <span className="text-sm font-bold tracking-tight text-slate-900">Quro</span>
        </div>
      </div>
    </section>
  );
}
