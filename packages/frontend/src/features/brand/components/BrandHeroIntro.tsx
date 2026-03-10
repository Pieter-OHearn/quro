import { QuroLogo } from '@/components/ui';

type BrandHeroIntroProps = {
  readonly heroTags: readonly string[];
};

export function BrandHeroIntro({ heroTags }: Readonly<BrandHeroIntroProps>) {
  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-8 mb-12">
      <div className="relative flex-shrink-0">
        <div className="absolute inset-0 rounded-[38px] bg-indigo-500/20 blur-2xl scale-110" />
        <QuroLogo size={160} showBg className="relative drop-shadow-2xl" />
      </div>
      <div>
        <h1 className="text-5xl font-black tracking-tight text-white mb-2">Quro</h1>
        <p className="text-indigo-300 mb-4 max-w-sm">
          The abstract Q arc — a single continuous stroke that wraps, opens, and rises. The upward
          tail symbolises financial momentum; the centrepoint grounds the form.
        </p>
        <div className="flex flex-wrap gap-2">
          {heroTags.map((tag) => (
            <span
              key={tag}
              className="text-[10px] font-semibold px-2.5 py-1 rounded-full bg-white/10 text-slate-300 uppercase tracking-wider"
            >
              {tag}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
