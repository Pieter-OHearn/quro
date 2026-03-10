import { QuroLogo } from '@/components/ui';

export function LandingFooter() {
  return (
    <footer className="bg-[#060b17] border-t border-white/5 py-10">
      <div className="max-w-6xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <QuroLogo size={24} showBg={false} />
          <span className="font-bold text-white text-sm">Quro</span>
          <span className="text-slate-600 text-sm">· Personal Finance</span>
        </div>
        <div className="flex items-center gap-6 text-xs text-slate-600">
          {['Privacy', 'Terms'].map((label) => (
            <a key={label} href="#" className="hover:text-slate-400 transition-colors">
              {label}
            </a>
          ))}
        </div>
        <p className="text-xs text-slate-700">© 2026 Quro. All rights reserved.</p>
      </div>
    </footer>
  );
}
