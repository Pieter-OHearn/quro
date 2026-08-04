import { useEffect, useMemo, useRef, useState } from 'react';
import { Bell, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router';
import { usePensionImportNotifications } from '@/features/pension/hooks';
import { useMortgages } from '@/features/mortgage/hooks';
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

const RING_DURATION_MS = 700;
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
  ring: boolean;
  unreadCount: number;
  hasActiveJobs: boolean;
  onToggle: () => void;
};

function BellButton({
  open,
  ring,
  unreadCount,
  hasActiveJobs,
  onToggle,
}: Readonly<BellButtonProps>) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`relative p-2 rounded-xl transition-colors ${
        open
          ? 'bg-slate-100 text-slate-700'
          : 'hover:bg-slate-100 text-slate-500 hover:text-slate-700'
      }`}
      title="Notifications"
    >
      <Bell size={18} className={ring ? 'animate-bounce' : ''} />

      {unreadCount > 0 && (
        <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 bg-rose-500 rounded-full flex items-center justify-center text-[9px] font-bold text-white border-2 border-white px-0.5 tabular-nums">
          {unreadCount > BADGE_OVERFLOW_LIMIT ? '9+' : unreadCount}
        </span>
      )}

      {unreadCount === 0 && hasActiveJobs && (
        <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-indigo-400 rounded-full border border-white animate-pulse" />
      )}
    </button>
  );
}

type DropdownProps = {
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
  notifications,
  counts,
  isLoading,
  isFetching,
  isError,
  onAction,
  onDismiss,
  onRetry,
}: Readonly<DropdownProps>) {
  return (
    <div className="absolute right-0 top-full mt-2 w-[360px] max-w-[92vw] bg-white rounded-2xl border border-slate-200 shadow-2xl z-50 overflow-hidden">
      <NotificationPanelHeader totalCount={notifications.length} isFetching={isFetching} />
      <NotificationStatusRow counts={counts} />

      {isLoading ? (
        <div className="py-8 flex items-center justify-center">
          <Loader2 size={18} className="animate-spin text-slate-400" />
        </div>
      ) : notifications.length === 0 ? (
        <NotificationEmptyState />
      ) : (
        <NotificationList notifications={notifications} onAction={onAction} onDismiss={onDismiss} />
      )}

      {isError && (
        <div className="px-4 py-2.5 border-t border-slate-100 bg-rose-50/60 flex items-center justify-between gap-3">
          <p className="text-[11px] text-rose-700">Couldn&apos;t refresh notifications.</p>
          <button
            type="button"
            onClick={onRetry}
            className="text-[11px] font-medium text-rose-700 hover:text-rose-800"
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
  const [ring, setRing] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const previousUnreadCountRef = useRef(0);
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
    if (unreadCount <= previousUnreadCountRef.current) {
      previousUnreadCountRef.current = unreadCount;
      return undefined;
    }

    setRing(true);
    const timeoutId = setTimeout(() => setRing(false), RING_DURATION_MS);
    previousUnreadCountRef.current = unreadCount;
    return () => clearTimeout(timeoutId);
  }, [unreadCount]);

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
        ring={ring}
        unreadCount={unreadCount}
        hasActiveJobs={hasActiveJobs}
        onToggle={() => setOpen((value) => !value)}
      />
      {open && (
        <Dropdown
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
