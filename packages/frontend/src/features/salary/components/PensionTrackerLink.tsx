import { ArrowRight, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router';

export function PensionTrackerLink() {
  return (
    <Link
      to="/pension"
      className="group flex min-h-11 items-center justify-between gap-3 rounded-lg border border-border-default bg-surface p-4 max-sm:rounded-xl transition-colors duration-fast hover:bg-surface-muted active:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus-ring"
    >
      <div className="flex items-center gap-2">
        <ShieldCheck size={16} className="shrink-0 text-fg-faint" aria-hidden />
        <div>
          <p className="text-title-section text-fg">Pension tracker</p>
          <p className="text-caption text-fg-subtle">
            View and manage your pension pots across currencies
          </p>
        </div>
      </div>
      <ArrowRight
        size={16}
        className="shrink-0 text-fg-faint transition-colors duration-fast group-hover:text-fg-muted"
        aria-hidden
      />
    </Link>
  );
}
