import { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Link2, RefreshCw, X } from 'lucide-react';
import { useSearchParams } from 'react-router';
import { Button, Card, IconButton } from '@/components/ui';
import { useBunqConnection } from '@/features/settings/hooks';
import { buildApiUrl } from '@/lib/api';
import { useAuth } from '@/lib/AuthContext';
import { useBunqAvailability } from '@/lib/useAppCapabilities';
import { cn } from '@/lib/utils';
import {
  hasDismissedSavingsConnectionPrompt,
  resolveBunqOAuthOutcome,
  savingsConnectionPromptStorageKey,
  shouldShowSavingsConnectionPrompt,
  type BunqOAuthOutcome,
  type SavingsConnectionPromptVisibility,
} from '../utils/connection-prompt';

type SavingsConnectionPromptCardProps = {
  className?: string;
  onConnect: () => void;
  onDismiss: () => void;
};

export function SavingsConnectionPromptCard({
  className,
  onConnect,
  onDismiss,
}: Readonly<SavingsConnectionPromptCardProps>) {
  return (
    <Card
      padding="none"
      className={cn('relative', className)}
      data-testid="savings-connection-prompt"
    >
      <div className="flex flex-col gap-4 p-4 pr-12 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <img src="/bunq-icon.png" alt="" className="mt-0.5 h-6 w-6 shrink-0 rounded-sm" />
          <div>
            <p className="text-label text-fg-muted">Automatic updates</p>
            <h2 className="mt-0.5 text-title-section text-fg">
              Keep your savings up to date with bunq
            </h2>
            <p className="mt-1 max-w-2xl text-body text-fg-muted">
              Connect once and Quro will automatically sync your balances and transactions, so there
              is no need to keep entering changes by hand.
            </p>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-caption text-fg-muted">
              <span className="inline-flex items-center gap-1.5">
                <RefreshCw size={12} className="text-fg-faint" aria-hidden />
                Real-time balances
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Link2 size={12} className="text-fg-faint" aria-hidden />
                Automatic transactions
              </span>
            </div>
          </div>
        </div>
        <Button
          size="md"
          className="w-full shrink-0 sm:w-auto"
          leadingIcon={<Link2 size={14} aria-hidden />}
          onClick={onConnect}
        >
          Connect bunq
        </Button>
      </div>
      <IconButton
        icon={X}
        label="Dismiss bunq connection suggestion"
        variant="subtle"
        className="absolute right-2 top-2"
        onClick={onDismiss}
      />
    </Card>
  );
}

type SavingsConnectionPromptViewProps = SavingsConnectionPromptVisibility &
  SavingsConnectionPromptCardProps;

export function SavingsConnectionPromptView({
  userId,
  isLoading,
  isError,
  hasConnection,
  dismissed,
  ...cardProps
}: Readonly<SavingsConnectionPromptViewProps>) {
  if (
    !shouldShowSavingsConnectionPrompt({
      userId,
      isLoading,
      isError,
      hasConnection,
      dismissed,
    })
  ) {
    return null;
  }
  return <SavingsConnectionPromptCard {...cardProps} />;
}

type SavingsConnectionOutcomeProps = {
  className?: string;
  outcome: BunqOAuthOutcome;
  onDismiss: () => void;
};

export function SavingsConnectionOutcome({
  className,
  outcome,
  onDismiss,
}: Readonly<SavingsConnectionOutcomeProps>) {
  const connected = outcome === 'connected';
  const Icon = connected ? CheckCircle2 : AlertCircle;
  return (
    <div
      role={connected ? 'status' : 'alert'}
      className={cn(
        'flex items-start gap-3 rounded-lg border px-3 py-2 text-cell',
        connected
          ? 'border-success bg-success-soft text-success'
          : 'border-danger bg-danger-soft text-danger',
        className,
      )}
    >
      <Icon size={16} className="mt-0.5 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{connected ? 'bunq connected' : 'Could not connect bunq'}</p>
        <p className="mt-0.5 text-fg-muted">
          {connected
            ? 'Your savings balances and transactions will now update automatically.'
            : 'Nothing was changed. Try connecting again when you are ready.'}
        </p>
      </div>
      <IconButton
        icon={X}
        label="Dismiss connection status"
        variant="subtle"
        className="shrink-0"
        onClick={onDismiss}
      />
    </div>
  );
}

export function SavingsConnectionPrompt({ className }: { className?: string }) {
  const { user } = useAuth();
  const { data: connection, isLoading, isError } = useBunqConnection();
  const { unavailable: bunqUnavailable } = useBunqAvailability();
  const [searchParams, setSearchParams] = useSearchParams();
  const [dismissed, setDismissed] = useState<boolean | null>(null);
  const [oauthOutcome, setOAuthOutcome] = useState(() =>
    resolveBunqOAuthOutcome(searchParams.get('bunq')),
  );

  useEffect(() => {
    if (!user) {
      setDismissed(null);
      return;
    }
    setDismissed(hasDismissedSavingsConnectionPrompt(localStorage, user.id));
  }, [user]);

  useEffect(() => {
    if (!oauthOutcome) return;
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.delete('bunq');
        return next;
      },
      { replace: true },
    );
  }, [oauthOutcome, setSearchParams]);

  const handleDismiss = () => {
    if (!user) return;
    localStorage.setItem(savingsConnectionPromptStorageKey(user.id), 'true');
    setDismissed(true);
  };

  const handleConnect = () => {
    window.location.href = buildApiUrl('/api/bunq/oauth/start?returnTo=savings');
  };

  if (!user) return null;

  return (
    <>
      {oauthOutcome ? (
        <SavingsConnectionOutcome
          className={className}
          outcome={oauthOutcome}
          onDismiss={() => setOAuthOutcome(null)}
        />
      ) : null}
      <SavingsConnectionPromptView
        className={cn(oauthOutcome && 'mt-4', className)}
        userId={user.id}
        isLoading={isLoading}
        isError={isError}
        hasConnection={Boolean(connection) || bunqUnavailable}
        dismissed={dismissed}
        onConnect={handleConnect}
        onDismiss={handleDismiss}
      />
    </>
  );
}
