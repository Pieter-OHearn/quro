import { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Landmark, Link2, RefreshCw, X } from 'lucide-react';
import { useSearchParams } from 'react-router';
import { Button, Card, IconButton } from '@/components/ui';
import { useBunqConnection } from '@/features/settings/hooks';
import { buildApiUrl } from '@/lib/api';
import { useAuth } from '@/lib/AuthContext';
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
      className={cn(
        'relative overflow-hidden border-brand-border bg-gradient-to-r from-brand-soft via-surface to-info-soft shadow-card',
        className,
      )}
      data-testid="savings-connection-prompt"
    >
      <div className="absolute -right-16 -top-20 h-48 w-48 rounded-full bg-info-soft-strong/60 blur-3xl" />
      <div className="relative flex flex-col gap-5 px-5 py-5 pr-12 sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:py-6 sm:pr-14">
        <div className="flex items-start gap-4">
          <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-surface shadow-card ring-1 ring-brand-border">
            <img src="/bunq-icon.png" alt="" className="h-8 w-8 rounded-lg" />
            <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-brand text-fg-inverted ring-2 ring-surface">
              <Landmark size={11} aria-hidden />
            </span>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-fg">
              Automatic updates
            </p>
            <h2 className="mt-1 text-lg font-semibold text-fg">
              Keep your savings up to date with bunq
            </h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-fg-subtle">
              Connect once and Quro will automatically sync your balances and transactions, so there
              is no need to keep entering changes by hand.
            </p>
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs font-medium text-fg-muted">
              <span className="inline-flex items-center gap-1.5">
                <RefreshCw size={13} className="text-brand" aria-hidden />
                Real-time balances
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Link2 size={13} className="text-brand" aria-hidden />
                Automatic transactions
              </span>
            </div>
          </div>
        </div>
        <Button
          size="md"
          className="w-full shrink-0 sm:w-auto"
          leadingIcon={<Link2 size={15} aria-hidden />}
          onClick={onConnect}
        >
          Connect bunq
        </Button>
      </div>
      <IconButton
        icon={X}
        label="Dismiss bunq connection suggestion"
        variant="subtle"
        className="absolute right-3 top-3"
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
        'flex items-start gap-3 rounded-xl border px-4 py-3 pr-3 text-sm',
        connected
          ? 'border-success-border bg-success-soft text-success-fg'
          : 'border-danger-border bg-danger-soft text-danger-fg',
        className,
      )}
    >
      <Icon size={18} className="mt-0.5 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{connected ? 'bunq connected' : 'Could not connect bunq'}</p>
        <p className="mt-0.5 opacity-80">
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
        className={cn(oauthOutcome && 'mt-6', className)}
        userId={user.id}
        isLoading={isLoading}
        isError={isError}
        hasConnection={Boolean(connection)}
        dismissed={dismissed}
        onConnect={handleConnect}
        onDismiss={handleDismiss}
      />
    </>
  );
}
