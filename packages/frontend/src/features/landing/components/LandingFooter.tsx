import { QuroLogo } from '@/components/ui';

export function LandingFooter() {
  return (
    <footer className="bg-surface-footer border-t border-fg-inverted/5 py-10">
      <div className="max-w-6xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <QuroLogo size={24} />
          <span className="font-bold text-fg-inverted text-sm">Quro</span>
          <span className="text-fg-muted text-sm">· Personal Finance</span>
        </div>
        <div className="flex items-center gap-6 text-xs text-fg-muted">
          {['Privacy', 'Terms'].map((label) => (
            <a key={label} href="#" className="hover:text-fg-faint transition-colors">
              {label}
            </a>
          ))}
        </div>
        <p className="text-xs text-fg-strong">© 2026 Quro. All rights reserved.</p>
      </div>
    </footer>
  );
}
