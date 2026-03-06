import { AlertTriangle, ChevronDown, ChevronUp, Home, RefreshCw, TrendingDown } from 'lucide-react';
import { QuroLogo } from '@/components/ui/QuroLogo';

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
    <header className="bg-gradient-to-r from-[#0a0f1e] to-[#1a1f3e] px-6 py-4 flex items-center justify-between flex-shrink-0 shadow-lg">
      <QuroLogo className="h-7 w-auto" />
      <span className="text-[10px] text-slate-500 tracking-widest uppercase font-semibold">
        System Error
      </span>
    </header>
  );
}

function ErrorIconCluster() {
  return (
    <div className="relative mb-8 select-none">
      <div className="absolute inset-0 rounded-full bg-indigo-200/25 blur-3xl scale-[2]" />
      <div className="relative w-28 h-28 rounded-full bg-white border-2 border-slate-100 shadow-2xl flex items-center justify-center">
        <div className="w-20 h-20 rounded-full bg-gradient-to-br from-indigo-50 via-white to-rose-50 flex items-center justify-center">
          <TrendingDown size={38} className="text-rose-400" strokeWidth={1.5} />
        </div>
        <div className="absolute -top-1.5 -right-1.5 w-9 h-9 rounded-full bg-amber-400 border-[3px] border-white flex items-center justify-center shadow-md">
          <AlertTriangle size={14} className="text-white" strokeWidth={2.5} />
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
        className="flex items-center justify-center gap-2.5 bg-gradient-to-r from-[#0a0f1e] to-[#1a1f3e] hover:from-[#131825] hover:to-[#252b50] text-white px-7 py-3 rounded-2xl transition-all shadow-lg hover:shadow-xl font-medium"
      >
        <Home size={15} />
        Back to Dashboard
      </button>
      <button
        type="button"
        onClick={onReload}
        className="flex items-center justify-center gap-2.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 px-7 py-3 rounded-2xl transition-all shadow-sm hover:shadow-md font-medium"
      >
        <RefreshCw size={15} />
        Try Again
      </button>
    </div>
  );
}

function ReassuranceStrip() {
  return (
    <div className="flex flex-wrap justify-center items-center gap-x-6 gap-y-2 text-xs text-slate-400 mb-8">
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
        className="w-full flex items-center justify-between px-4 py-3 bg-white border border-slate-200 rounded-2xl hover:bg-slate-50 transition-colors text-slate-500 text-sm group"
      >
        <span className="flex items-center gap-2.5">
          <span className="text-[10px] font-mono bg-slate-100 group-hover:bg-indigo-50 group-hover:text-indigo-500 text-slate-500 px-2 py-0.5 rounded-md transition-colors font-semibold tracking-wider">
            DEV
          </span>
          <span className="text-slate-600">Technical details</span>
          <span className="text-slate-300 text-xs font-normal hidden sm:block">
            for the curious
          </span>
        </span>
        {showDetails ? (
          <ChevronUp size={15} className="text-slate-400" />
        ) : (
          <ChevronDown size={15} className="text-slate-400" />
        )}
      </button>

      {showDetails && (
        <div className="mt-2 bg-[#0d1117] border border-slate-700/60 rounded-2xl overflow-hidden shadow-xl">
          <div className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-700/60 bg-[#161b22]">
            <div className="flex gap-1.5">
              <div className="w-3 h-3 rounded-full bg-rose-500/80" />
              <div className="w-3 h-3 rounded-full bg-amber-500/80" />
              <div className="w-3 h-3 rounded-full bg-emerald-500/80" />
            </div>
            <span className="text-xs text-slate-500 font-mono ml-2">error.log - quro</span>
          </div>
          <pre className="p-4 text-xs font-mono text-rose-300/90 overflow-auto max-h-56 leading-relaxed whitespace-pre-wrap break-all">
            {detail}
          </pre>
        </div>
      )}
    </div>
  );
}

function ErrorFooter() {
  return (
    <footer className="flex-shrink-0 border-t border-slate-200 bg-white px-6 py-4 flex items-center justify-between">
      <div className="flex items-center gap-2.5">
        <QuroLogo className="h-5 w-auto opacity-40" />
        <span className="text-xs text-slate-400">Quro · Personal Finance</span>
      </div>
      <p className="text-xs text-slate-400">Apologies for the inconvenience</p>
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
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <ErrorHeader />

      <div className="flex-1 flex flex-col items-center justify-center px-4 py-16">
        <ErrorIconCluster />

        <div className="flex items-center gap-2 bg-rose-50 border border-rose-200 text-rose-600 px-3 py-1.5 rounded-full text-[11px] font-semibold mb-5 tracking-widest uppercase">
          <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse flex-shrink-0" />
          Unexpected Error
        </div>

        <h1 className="text-3xl font-bold text-slate-900 text-center mb-3 max-w-lg leading-tight">
          {title}
        </h1>

        <p className="text-slate-500 text-center max-w-md mb-2 leading-relaxed">
          {message ?? (
            <>
              Quro&apos;s brain momentarily forgot how finance works. That&apos;s on us, not you -
              your data is completely safe and totally untouched.
            </>
          )}
        </p>
        <p className="text-slate-400 text-sm text-center max-w-sm mb-10 leading-relaxed">
          A very intense internal meeting is probably being scheduled about this right now.
          We&apos;re sorry, and we owe you a coffee.
        </p>

        <ErrorActions onGoHome={onGoHome} onReload={onReload} />
        <ReassuranceStrip />

        <div className="w-full max-w-md border-t border-slate-200 mb-6" />
        <DetailsPanel detail={detail} showDetails={showDetails} onToggleDetails={onToggleDetails} />
      </div>

      <ErrorFooter />
    </div>
  );
}
