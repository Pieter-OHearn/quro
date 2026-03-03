import { SectionHeader } from './SectionHeader';

type UsageGuidelinesSectionProps = {
  readonly donts: readonly string[];
};

export function UsageGuidelinesSection({ donts }: Readonly<UsageGuidelinesSectionProps>) {
  return (
    <section>
      <SectionHeader title="Usage Guidelines" sub="Keep the mark consistent and intentional" />
      <div className="mt-6 grid sm:grid-cols-2 gap-3">
        {donts.map((item) => (
          <div
            key={item}
            className="flex items-start gap-3 bg-white rounded-xl border border-slate-100 px-4 py-3 shadow-sm"
          >
            <div className="w-5 h-5 rounded-full bg-rose-100 flex items-center justify-center flex-shrink-0 mt-0.5">
              <span className="text-rose-500 text-[10px] font-black leading-none">✕</span>
            </div>
            <p className="text-xs text-slate-600">{item}</p>
          </div>
        ))}
        <div className="flex items-start gap-3 bg-white rounded-xl border border-slate-100 px-4 py-3 shadow-sm">
          <div className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0 mt-0.5">
            <span className="text-emerald-600 text-[10px] font-black leading-none">✓</span>
          </div>
          <p className="text-xs text-slate-600">
            Always use the provided SVG — never recreate the mark by hand
          </p>
        </div>
      </div>
    </section>
  );
}
