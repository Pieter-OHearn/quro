import { ArrowRight, Sparkles } from 'lucide-react';
import { QuroLogo } from '@/components/ui/QuroLogo';

type CtaSectionProps = {
  onSignUp: () => void;
  onSignIn: () => void;
};

export function CtaSection({ onSignUp, onSignIn }: Readonly<CtaSectionProps>) {
  return (
    <section className="relative bg-[#0a0f1e] py-24 overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/3 w-96 h-96 bg-indigo-700/20 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/3 w-64 h-64 bg-purple-700/20 rounded-full blur-3xl" />
      </div>
      <div className="relative max-w-3xl mx-auto px-6 text-center">
        <div className="flex justify-center mb-8">
          <QuroLogo size={64} showBg />
        </div>
        <h2 className="font-black text-4xl lg:text-5xl tracking-tight mb-5">
          Take control of your{' '}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-400">
            financial future
          </span>
        </h2>
        <p className="text-slate-400 text-lg mb-8 max-w-xl mx-auto">
          Join Quro and get the clarity your finances deserve — completely free.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={onSignUp}
            className="inline-flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-8 py-4 rounded-xl font-semibold transition-all shadow-xl shadow-indigo-600/30 hover:-translate-y-0.5"
          >
            <Sparkles size={16} />
            Create free account
            <ArrowRight size={16} />
          </button>
          <button
            onClick={onSignIn}
            className="inline-flex items-center justify-center gap-2 border border-white/20 hover:border-white/40 text-slate-300 hover:text-white px-8 py-4 rounded-xl font-medium transition-all hover:bg-white/5"
          >
            Sign in
          </button>
        </div>
      </div>
    </section>
  );
}
