import { AlertTriangle, ChevronDown, ChevronUp, Home, RefreshCw } from 'lucide-react';
import { Badge, Button, QuroLogo } from '@/components/ui';

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

const DETAILS_ID = 'error-technical-details';

// The header sits on the page ground like the app header, so the evergreen mark keeps its contrast.
function ErrorHeader() {
  return (
    <header className="flex h-12 flex-shrink-0 items-center justify-between border-b border-border-default bg-surface-sunken px-4 sm:px-6">
      <div className="flex items-center gap-2">
        <QuroLogo size={20} />
        <span className="text-title-section text-fg">Quro</span>
      </div>
      <span className="text-label text-fg-muted">System error</span>
    </header>
  );
}

type ErrorActionsProps = Pick<ErrorDisplayProps, 'onGoHome' | 'onReload'>;

function ErrorActions({ onGoHome, onReload }: ErrorActionsProps) {
  return (
    <div className="mb-6 flex flex-col gap-2 sm:flex-row">
      <Button size="lg" leadingIcon={<Home size={16} />} onClick={onGoHome}>
        Back to Dashboard
      </Button>
      <Button
        size="lg"
        variant="secondary"
        leadingIcon={<RefreshCw size={16} />}
        onClick={onReload}
      >
        Try again
      </Button>
    </div>
  );
}

function ReassuranceStrip() {
  return (
    <ul className="mb-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-caption text-fg-subtle">
      {reassuranceItems.map((label) => (
        <li key={label}>{label}</li>
      ))}
    </ul>
  );
}

type DetailsPanelProps = Pick<ErrorDisplayProps, 'detail' | 'showDetails' | 'onToggleDetails'>;

function DetailsPanel({ detail, showDetails, onToggleDetails }: DetailsPanelProps) {
  if (!detail) return null;

  return (
    <div className="w-full">
      <button
        type="button"
        aria-expanded={Boolean(showDetails)}
        aria-controls={DETAILS_ID}
        onClick={onToggleDetails}
        className="flex min-h-8 w-full items-center justify-between gap-3 rounded-md border border-border-default bg-surface px-3 py-1.5 text-cell text-fg transition-colors duration-fast hover:bg-surface-muted active:bg-surface-muted max-sm:min-h-11 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus-ring"
      >
        <span className="flex items-center gap-2">
          <Badge>Dev</Badge>
          <span>Technical details</span>
          <span className="hidden text-caption text-fg-subtle sm:block">for the curious</span>
        </span>
        {showDetails ? (
          <ChevronUp size={16} className="text-fg-muted" aria-hidden="true" />
        ) : (
          <ChevronDown size={16} className="text-fg-muted" aria-hidden="true" />
        )}
      </button>

      {showDetails && (
        <div
          id={DETAILS_ID}
          className="mt-2 overflow-hidden rounded-md border border-border-default bg-surface"
        >
          <p className="border-b border-border-default px-3 py-1.5 text-caption text-fg-subtle">
            error.log - quro
          </p>
          <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-all p-3 text-caption text-fg">
            {detail}
          </pre>
        </div>
      )}
    </div>
  );
}

function ErrorFooter() {
  return (
    <footer className="flex flex-shrink-0 flex-col items-center justify-between gap-2 border-t border-border-default px-4 py-3 text-caption text-fg-subtle sm:flex-row sm:px-6">
      <span>Quro · Personal finance</span>
      <p>Apologies for the inconvenience</p>
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
    <div className="flex min-h-screen flex-col bg-surface-sunken text-fg">
      <ErrorHeader />

      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center px-4 py-12">
        <span className="mb-4 inline-flex w-fit items-center gap-1.5 rounded-sm border border-danger bg-danger-soft px-1.5 py-px text-[11px] leading-4 font-medium text-danger">
          <AlertTriangle size={12} aria-hidden="true" />
          Unexpected error
        </span>

        <h1 className="mb-2 text-title-page text-fg">{title}</h1>

        <p className="mb-2 text-body text-fg-muted">
          {message ?? (
            <>
              Quro&apos;s brain momentarily forgot how finance works. That&apos;s on us, not you -
              your data is completely safe and totally untouched.
            </>
          )}
        </p>
        <p className="mb-6 text-cell text-fg-subtle">
          A very intense internal meeting is probably being scheduled about this right now.
          We&apos;re sorry, and we owe you a coffee.
        </p>

        <ErrorActions onGoHome={onGoHome} onReload={onReload} />
        <ReassuranceStrip />

        <DetailsPanel detail={detail} showDetails={showDetails} onToggleDetails={onToggleDetails} />
      </main>

      <ErrorFooter />
    </div>
  );
}
