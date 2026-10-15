import { Monitor } from 'lucide-react';
import type { UserSession } from '@quro/shared';
import type { ReactNode } from 'react';
import { Badge, Button, Card, LoadingState, PanelHeader } from '@/components/ui';
import { resolveApiErrorMessage } from '@/lib/api';
import { useRevokeOtherSessions, useRevokeSession, useSessions } from '../hooks';
import { describeUserAgent, formatSessionTime } from '../utils/sessionDisplay';

type SessionsListProps = {
  sessions: readonly UserSession[];
  revokingId: string | null;
  revokingOthers: boolean;
  error: string | null;
  onRevoke: (id: string) => void;
  onRevokeOthers: () => void;
};

function SessionRow({
  session,
  revoking,
  onRevoke,
}: Readonly<{ session: UserSession; revoking: boolean; onRevoke: (id: string) => void }>) {
  const browser = describeUserAgent(session.userAgent);
  return (
    <li className="flex min-h-12 items-center justify-between gap-3 px-4 py-2">
      <div className="flex min-w-0 items-center gap-2">
        <Monitor size={16} className="flex-shrink-0 text-fg-faint" aria-hidden="true" />
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-cell font-medium text-fg">
            {browser}
            {session.current ? <Badge tone="success">This browser</Badge> : null}
          </p>
          <p className="text-caption text-fg-subtle">
            Last active {formatSessionTime(session.lastUsedAt)} · Signed in{' '}
            {formatSessionTime(session.createdAt)}
          </p>
        </div>
      </div>
      {session.current ? null : (
        <Button
          variant="ghost"
          size="sm"
          className="flex-shrink-0 whitespace-nowrap"
          aria-label={`Sign out ${browser}, last active ${formatSessionTime(session.lastUsedAt)}`}
          loading={revoking}
          onClick={() => onRevoke(session.id)}
        >
          Sign out
        </Button>
      )}
    </li>
  );
}

export function SessionsList({
  sessions,
  revokingId,
  revokingOthers,
  error,
  onRevoke,
  onRevokeOthers,
}: Readonly<SessionsListProps>) {
  const hasOthers = sessions.some((session) => !session.current);

  return (
    <SessionsCard>
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <p className="max-w-md text-caption text-fg-subtle">
          Each sign-in lasts 30 days. Sign out any browser you no longer use or do not recognise.
        </p>
        {hasOthers ? (
          <Button variant="secondary" size="sm" loading={revokingOthers} onClick={onRevokeOthers}>
            Sign out all other browsers
          </Button>
        ) : null}
      </div>
      {error ? <p className="px-4 pb-3 text-cell text-danger">{error}</p> : null}
      <ul className="divide-y divide-border-subtle border-t border-border-default">
        {sessions.map((session) => (
          <SessionRow
            key={session.id}
            session={session}
            revoking={revokingId === session.id}
            onRevoke={onRevoke}
          />
        ))}
      </ul>
    </SessionsCard>
  );
}

function SessionsCard({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <Card padding="none">
      <PanelHeader title="Signed-in browsers" />
      {children}
    </Card>
  );
}

export function SessionsPanel() {
  const sessions = useSessions();
  const revoke = useRevokeSession();
  const revokeOthers = useRevokeOtherSessions();

  if (sessions.isPending) {
    return (
      <SessionsCard>
        <LoadingState compact className="min-h-0 py-6" label="Loading signed-in browsers" />
      </SessionsCard>
    );
  }
  if (sessions.isError) {
    return (
      <SessionsCard>
        <p className="p-4 text-cell text-danger">
          {resolveApiErrorMessage(sessions.error, 'Could not load your signed-in browsers')}
        </p>
      </SessionsCard>
    );
  }

  const failure = revoke.error ?? revokeOthers.error;
  return (
    <SessionsList
      sessions={sessions.data}
      revokingId={revoke.isPending ? (revoke.variables ?? null) : null}
      revokingOthers={revokeOthers.isPending}
      error={failure ? resolveApiErrorMessage(failure, 'Could not sign that browser out') : null}
      onRevoke={(id) => revoke.mutate(id)}
      onRevokeOthers={() => revokeOthers.mutate()}
    />
  );
}
