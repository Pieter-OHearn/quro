import { ArrowRight, Sparkles } from 'lucide-react';
import { HERO_TRUST_BADGES } from '../utils/landing-data';
import { AppPreview } from './AppPreview';

type HeroSectionProps = {
  onSignUp: () => void;
  onSignIn: () => void;
};

function HeroCtaButtons({ onSignUp, onSignIn }: Readonly<HeroSectionProps>) {
  return (
    <>
      <div className="flex flex-col sm:flex-row gap-3 mb-10">
        <button
          onClick={onSignUp}
          className="inline-flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-7 py-3.5 rounded-xl font-semibold transition-all shadow-xl shadow-indigo-600/30 hover:shadow-indigo-500/40 hover:-translate-y-0.5"
        >
          <Sparkles size={16} />
          Get started free
          <ArrowRight size={16} />
        </button>
        <button
          onClick={onSignIn}
          className="inline-flex items-center justify-center gap-2 border border-white/20 hover:border-white/40 text-slate-300 hover:text-white px-7 py-3.5 rounded-xl font-medium transition-all hover:bg-white/5"
        >
          Sign in to your account
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-5 text-xs text-slate-500">
        {HERO_TRUST_BADGES.map(({ icon: Icon, text }) => (
          <div key={text} className="flex items-center gap-1.5">
            <Icon size={12} className="text-indigo-400" />
            <span>{text}</span>
          </div>
        ))}
      </div>
    </>
  );
}

export function HeroSection({ onSignUp, onSignIn }: Readonly<HeroSectionProps>) {
  return (
    <section className="relative overflow-hidden">
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-indigo-700/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-80 h-80 bg-purple-700/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-indigo-900/10 rounded-full blur-3xl pointer-events-none" />
      <div className="relative max-w-6xl mx-auto px-6 py-20 lg:py-28 grid lg:grid-cols-2 gap-16 items-center">
        <div>
          <div className="inline-flex items-center gap-2 bg-indigo-600/20 border border-indigo-500/30 rounded-full px-4 py-1.5 mb-8">
            <Sparkles size={13} className="text-indigo-400" />
            <span className="text-indigo-300 text-xs font-semibold">
              Personal finance, beautifully simplified
            </span>
          </div>
          <h1 className="font-black text-5xl lg:text-6xl tracking-tight leading-[1.05] mb-6">
            Your finances,{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-400">
              beautifully
            </span>{' '}
            organised.
          </h1>
          <p className="text-slate-400 text-lg leading-relaxed mb-8 max-w-lg">
            Quro unifies your savings, investments, mortgage, pension, salary and budget in one
            elegant dashboard — with full multi-currency support for wherever life takes you.
          </p>
          <HeroCtaButtons onSignUp={onSignUp} onSignIn={onSignIn} />
        </div>
        <div className="flex justify-center lg:justify-end">
          <AppPreview />
        </div>
      </div>
    </section>
  );
}
