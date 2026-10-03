import { ArrowRight, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router';

export function PensionTrackerLink() {
  return (
    <Link
      to="/pension"
      className="flex items-center justify-between bg-gradient-to-r from-warning-soft to-accent-warm-soft border border-warning-soft-strong rounded-2xl p-5 hover:shadow-md transition-shadow group"
    >
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-xl bg-warning-soft-strong text-warning flex items-center justify-center">
          <ShieldCheck size={22} />
        </div>
        <div>
          <p className="font-semibold text-fg-emphasis">Pension Tracker</p>
          <p className="text-xs text-fg-subtle mt-0.5">
            View and manage your pension pots across currencies
          </p>
        </div>
      </div>
      <ArrowRight
        size={18}
        className="text-warning-accent group-hover:translate-x-1 transition-transform"
      />
    </Link>
  );
}
