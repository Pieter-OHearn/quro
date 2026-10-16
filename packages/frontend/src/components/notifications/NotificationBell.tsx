import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Bell, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router';
import { usePensionImportNotifications } from '@/features/pension/hooks';
import { useMortgages } from '@/features/mortgage/hooks';
import { useFocusTrap } from '@/components/ui';
import { useAuth } from '@/lib/AuthContext';
import { buildNotificationStatusCounts, mapImportFeedToNotifications } from './notification-utils';
import { NotificationEmptyState } from './NotificationEmptyState';
import { NotificationList } from './NotificationList';
import { NotificationPanelHeader } from './NotificationPanelHeader';
import { NotificationStatusRow } from './NotificationStatusRow';
import {
  buildMortgageExpiryNotifications,
  mortgageDismissalStorageKey,
  parseDismissedNotificationKeys,
} from './mortgage-notifications';
import type { NotificationItem, NotificationStatusCounts } from './types';

const BADGE_OVERFLOW_LIMIT = 9;

function useMortgageReminders(
  userId: number | undefined,
  mortgages: Parameters<typeof buildMortgageExpiryNotifications>[0],
) {
  const [dismissedKeys, setDismissedKeys] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (userId === undefined) {
      setDismissedKeys(new Set());
      return;
    }
    setDismissedKeys(
      parseDismissedNotificationKeys(localStorage.getItem(mortgageDismissalStorageKey(userId))),
    );
  }, [userId]);

  const notifications = useMemo(
    () => buildMortgageExpiryNotifications(mortgages, dismissedKeys),
    [dismissedKeys, mortgages],
  );

  const dismiss = (notification: NotificationItem): void => {
    if (userId === undefined || notification.kind !== 'mortgage_expiry') return;
    setDismissedKeys((current) => {
      const next = new Set(current).add(notification.dismissalKey);
      localStorage.setItem(mortgageDismissalStorageKey(userId), JSON.stringify([...next]));
      return next;
    });
  };

  return { notifications, dismiss };
}

type BellButtonProps = {
  open: boolean;
  panelId: string;
  unreadCount: number;
  hasActiveJobs: boolean;
  onToggle: () => void;
};

function BellButton({
  open,
  panelId,
  unreadCount,
  hasActiveJobs,
  onToggle,
}: Readonly<BellButtonProps>) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`relative inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors duration-fast max-sm:h-11 max-sm:w-11 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus-ring ${
        open
          ? 'bg-surface-muted text-fg'
          : 'text-fg-subtle hover:bg-surface-muted hover:text-fg active:bg-surface-muted'
      }`}
      title="Notifications"
      aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} new` : 'Notifications'}
      aria-expanded={open}
      aria-controls={open ? panelId : undefined}
      aria-haspopup="dialog"
    >
      {/* No ring or bounce when a notification arrives: the count badge is the signal. */}
      <Bell size={16} aria-hidden />

      {unreadCount > 0 && (
        <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-sm border-2 border-surface-sunken bg-danger px-0.5 text-[11px] leading-none font-semibold text-fg-inverted tabular-nums">
          {unreadCount > BADGE_OVERFLOW_LIMIT ? '9+' : unreadCount}
        </span>
      )}

      {unreadCount === 0 && hasActiveJobs && (
        <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full motion-safe:animate-pulse border border-surface-sunken bg-brand" />
      )}
    </button>
  );
}

type DropdownProps = {
  id: string;
  onClose: () => void;
  notifications: NotificationItem[];
  counts: NotificationStatusCounts;
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  onAction: (notification: NotificationItem) => void;
  onDismiss: (notification: NotificationItem) => void;
  onRetry: () => void;
};

function Dropdown({
  id,
  onClose,
  notifications,
  counts,
  isLoading,
  isFetching,
  isError,
  onAction,
  onDismiss,
  onRetry,
}: Readonly<DropdownProps>) {
  // Escape closes the panel and returns focus to the bell, which opened it.
  const panelRef = useRef<HTMLDivElement>(null);
  useFocusTrap({ containerRef: panelRef, active: true, onEscape: onClose });

  return (
    <div
      ref={panelRef}
      id={id}
      role="dialog"
      aria-label="Notifications"
      tabIndex={-1}
      className="absolute right-0 top-full z-50 mt-2 w-[360px] max-w-[92vw] overflow-hidden rounded-lg border border-border-default bg-surface shadow-popover outline-none max-sm:fixed max-sm:inset-x-4 max-sm:top-14 max-sm:w-auto max-sm:max-w-none"
    >
      <NotificationPanelHeader totalCount={notifications.length} isFetching={isFetching} />
      <NotificationStatusRow counts={counts} />

      {isLoading ? (
        <div className="py-8 flex items-center justify-center">
          <Loader2 size={18} className="animate-spin text-fg-faint" />
        </div>
      ) : notifications.length === 0 ? (
        <NotificationEmptyState />
      ) : (
        <NotificationList notifications={notifications} onAction={onAction} onDismiss={onDismiss} />
      )}

      {isError && (
        <div className="flex items-center justify-between gap-3 border-t border-border-default bg-danger-soft px-3 py-1.5">
          <p className="text-caption text-danger">Couldn&apos;t refresh notifications.</p>
          <button
            type="button"
            onClick={onRetry}
            className="rounded-sm text-label text-danger hover:underline max-sm:min-h-11 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus-ring"
          >
            Retry
          </button>
        </div>
      )}
    </div>
  );
}

export function NotificationBell() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const notificationsQuery = usePensionImportNotifications();
  const mortgagesQuery = useMortgages();
  const mortgageReminders = useMortgageReminders(user?.id, mortgagesQuery.data ?? []);

  const notifications = useMemo(() => {
    const imports = mapImportFeedToNotifications(notificationsQuery.data ?? []);
    return [...mortgageReminders.notifications, ...imports];
  }, [mortgageReminders.notifications, notificationsQuery.data]);
  const counts = useMemo(() => buildNotificationStatusCounts(notifications), [notifications]);
  const unreadCount = counts.ready + counts.failed + counts.reminder;
  const hasActiveJobs = counts.queuing > 0 || counts.processing > 0;

  useEffect(() => {
    if (!open) return undefined;

    const onOutsideClick = (event: MouseEvent): void => {
      if (panelRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    };

    document.addEventListener('mousedown', onOutsideClick);
    return () => document.removeEventListener('mousedown', onOutsideClick);
  }, [open]);

  const handleAction = (notification: NotificationItem): void => {
    if (!notification.actionable) return;
    setOpen(false);
    if (notification.kind === 'mortgage_expiry') {
      void navigate(`/mortgage?mortgageId=${notification.mortgageId}`);
      return;
    }
    void navigate('/pension', {
      state: {
        openImportId: notification.importId,
        openImportPotId: notification.potId,
      },
    });
  };

  return (
    <div className="relative" ref={panelRef}>
      <BellButton
        open={open}
        panelId={panelId}
        unreadCount={unreadCount}
        hasActiveJobs={hasActiveJobs}
        onToggle={() => {
          if (!open) void notificationsQuery.refetch();
          setOpen((value) => !value);
        }}
      />
      {open && (
        <Dropdown
          id={panelId}
          onClose={() => setOpen(false)}
          notifications={notifications}
          counts={counts}
          isLoading={notificationsQuery.isLoading || mortgagesQuery.isLoading}
          isFetching={notificationsQuery.isFetching || mortgagesQuery.isFetching}
          isError={notificationsQuery.isError || mortgagesQuery.isError}
          onAction={handleAction}
          onDismiss={mortgageReminders.dismiss}
          onRetry={() => {
            void notificationsQuery.refetch();
            void mortgagesQuery.refetch();
          }}
        />
      )}
    </div>
  );
}
