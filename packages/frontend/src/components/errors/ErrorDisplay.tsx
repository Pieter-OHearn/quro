import { AlertTriangle, ChevronDown, ChevronUp, Home, RefreshCw, TrendingDown } from 'lucide-react';
import { QuroLogo } from '@/components/ui';

export type ErrorDisplayProps = {
  title?: string;
  message?: string;
  detail?: string;
  onGoHome?: () => void;
  onReload?: () => void;
  showDetails?: boolean;
  onToggleDetails?: () => void;
};

const reassuranceItems = [
  'Your data is safe',
  'Nothing was deleted',
  'Your finances are intact',
  'Entirely our fault',
];

function ErrorHeader() {
  return (
    <header className="bg-gradient-to-r from-surface-inverse to-surface-inverse-panel px-6 py-4 flex items-center justify-between flex-shrink-0 shadow-lg">
      <QuroLogo className="h-7 w-auto" />
      <span className="text-[10px] text-fg-subtle tracking-widest uppercase font-semibold">
        System Error
      </span>
    </header>
  );
}

function ErrorIconCluster() {
  return (
    <div className="relative mb-8 select-none">
      <div className="absolute inset-0 rounded-full bg-brand-tint/25 blur-3xl scale-[2]" />
      <div className="relative w-28 h-28 rounded-full bg-surface border-2 border-border-subtle shadow-2xl flex items-center justify-center">
        <div className="w-20 h-20 rounded-full bg-gradient-to-br from-brand-soft via-surface to-danger-soft flex items-center justify-center">
          <TrendingDown size={38} className="text-danger-muted" strokeWidth={1.5} />
        </div>
        <div className="absolute -top-1.5 -right-1.5 w-9 h-9 rounded-full bg-warning-muted border-[3px] border-fg-inverted flex items-center justify-center shadow-md">
          <AlertTriangle size={14} className="text-fg-inverted" strokeWidth={2.5} />
        </div>
      </div>
    </div>
  );
}

type ErrorActionsProps = Pick<ErrorDisplayProps, 'onGoHome' | 'onReload'>;

function ErrorActions({ onGoHome, onReload }: ErrorActionsProps) {
  return (
    <div className="flex flex-col sm:flex-row gap-3 mb-10">
      <button
        type="button"
        onClick={onGoHome}
        className="flex items-center justify-center gap-2.5 bg-gradient-to-r from-surface-inverse to-surface-inverse-panel hover:from-surface-inverse-hover hover:to-surface-inverse-panel-hover text-fg-inverted px-7 py-3 rounded-2xl transition-all shadow-lg hover:shadow-xl font-medium"
      >
        <Home size={15} />
        Back to Dashboard
      </button>
      <button
        type="button"
        onClick={onReload}
        className="flex items-center justify-center gap-2.5 bg-surface hover:bg-surface-sunken text-fg-strong border border-border-default px-7 py-3 rounded-2xl transition-all shadow-sm hover:shadow-md font-medium"
      >
        <RefreshCw size={15} />
        Try Again
      </button>
    </div>
  );
}

function ReassuranceStrip() {
  return (
    <div className="flex flex-wrap justify-center items-center gap-x-6 gap-y-2 text-xs text-fg-faint mb-8">
      {reassuranceItems.map((label) => (
        <div key={label} className="flex items-center gap-1.5">
          <span>{label}</span>
        </div>
      ))}
    </div>
  );
}

type DetailsPanelProps = Pick<ErrorDisplayProps, 'detail' | 'showDetails' | 'onToggleDetails'>;

function DetailsPanel({ detail, showDetails, onToggleDetails }: DetailsPanelProps) {
  if (!detail) return null;

  return (
    <div className="w-full max-w-lg">
      <button
        type="button"
        onClick={onToggleDetails}
        className="w-full flex items-center justify-between px-4 py-3 bg-surface border border-border-default rounded-2xl hover:bg-surface-sunken transition-colors text-fg-subtle text-sm group"
      >
        <span className="flex items-center gap-2.5">
          <span className="text-[10px] bg-surface-muted group-hover:bg-brand-soft group-hover:text-brand-accent text-fg-subtle px-2 py-0.5 rounded-md transition-colors font-semibold tracking-wider">
            DEV
          </span>
          <span className="text-fg-muted">Technical details</span>
          <span className="text-fg-disabled text-xs font-normal hidden sm:block">
            for the curious
          </span>
        </span>
        {showDetails ? (
          <ChevronUp size={15} className="text-fg-faint" />
        ) : (
          <ChevronDown size={15} className="text-fg-faint" />
        )}
      </button>

      {showDetails && (
        <div className="mt-2 bg-surface-code border border-fg-strong/60 rounded-2xl overflow-hidden shadow-xl">
          <div className="flex items-center gap-2 px-4 py-2.5 border-b border-fg-strong/60 bg-surface-code-header">
            <div className="flex gap-1.5">
              <div className="w-3 h-3 rounded-full bg-danger/80" />
              <div className="w-3 h-3 rounded-full bg-warning-accent/80" />
              <div className="w-3 h-3 rounded-full bg-success-accent/80" />
            </div>
            <span className="text-xs text-fg-subtle ml-2">error.log - quro</span>
          </div>
          <pre className="p-4 text-xs text-danger-border-strong/90 overflow-auto max-h-56 leading-relaxed whitespace-pre-wrap break-all">
            {detail}
          </pre>
        </div>
      )}
    </div>
  );
}

function ErrorFooter() {
  return (
    <footer className="flex-shrink-0 border-t border-border-default bg-surface px-6 py-4 flex items-center justify-between">
      <div className="flex items-center gap-2.5">
        <QuroLogo className="h-5 w-auto opacity-40" />
        <span className="text-xs text-fg-faint">Quro · Personal Finance</span>
      </div>
      <p className="text-xs text-fg-faint">Apologies for the inconvenience</p>
    </footer>
  );
}

export function ErrorDisplay({
  title = 'Well, this is embarrassing.',
  message,
  detail,
  onGoHome,
  onReload,
  showDetails,
  onToggleDetails,
}: ErrorDisplayProps) {
  return (
    <div className="min-h-screen bg-surface-sunken flex flex-col">
      <ErrorHeader />

      <div className="flex-1 flex flex-col items-center justify-center px-4 py-16">
        <ErrorIconCluster />

        <div className="flex items-center gap-2 bg-danger-soft border border-danger-border text-danger-hover px-3 py-1.5 rounded-full text-[11px] font-semibold mb-5 tracking-widest uppercase">
          <span className="w-1.5 h-1.5 rounded-full bg-danger animate-pulse flex-shrink-0" />
          Unexpected Error
        </div>

        <h1 className="text-3xl font-bold text-fg text-center mb-3 max-w-lg leading-tight">
          {title}
        </h1>

        <p className="text-fg-subtle text-center max-w-md mb-2 leading-relaxed">
          {message ?? (
            <>
              Quro&apos;s brain momentarily forgot how finance works. That&apos;s on us, not you -
              your data is completely safe and totally untouched.
            </>
          )}
        </p>
        <p className="text-fg-faint text-sm text-center max-w-sm mb-10 leading-relaxed">
          A very intense internal meeting is probably being scheduled about this right now.
          We&apos;re sorry, and we owe you a coffee.
        </p>

        <ErrorActions onGoHome={onGoHome} onReload={onReload} />
        <ReassuranceStrip />

        <div className="w-full max-w-md border-t border-border-default mb-6" />
        <DetailsPanel detail={detail} showDetails={showDetails} onToggleDetails={onToggleDetails} />
      </div>

      <ErrorFooter />
    </div>
  );
}
