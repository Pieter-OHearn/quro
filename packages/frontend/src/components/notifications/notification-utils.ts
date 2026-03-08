import type { PensionStatementImportFeedItem } from '@quro/shared';
import type { ImportNotificationItem, NotificationStatus, NotificationStatusCounts } from './types';

const FALLBACK_POT_EMOJI = '🏦';

function toNotificationStatus(
  status: PensionStatementImportFeedItem['import']['status'],
): NotificationStatus {
  if (status === 'queued') return 'queuing';
  if (status === 'processing') return 'processing';
  if (status === 'ready_for_review') return 'ready';
  return 'failed';
}

function toNotificationTitle(status: NotificationStatus): string {
  if (status === 'queuing') return 'Statement queued';
  if (status === 'processing') return 'Processing statement';
  if (status === 'ready') return 'Statement ready to review';
  return 'Statement failed';
}

function toNotificationBody(
  item: PensionStatementImportFeedItem,
  status: NotificationStatus,
): string {
  if (status === 'queuing')
    return `${item.pot.provider} · Waiting to process ${item.import.fileName}`;
  if (status === 'processing') return `${item.pot.provider} · Parsing ${item.import.fileName}`;
  if (status === 'ready') return `${item.pot.provider} · Review extracted rows before commit`;
  return item.import.errorMessage ?? `${item.pot.provider} · Import failed during processing`;
}

export function mapImportFeedToNotifications(
  feedItems: PensionStatementImportFeedItem[],
): ImportNotificationItem[] {
  return [...feedItems]
    .sort((a, b) => new Date(b.import.updatedAt).valueOf() - new Date(a.import.updatedAt).valueOf())
    .map((item) => {
      const status = toNotificationStatus(item.import.status);
      const unread = status === 'ready' || status === 'failed';
      const actionable = unread;

      return {
        id: `import-${item.import.id}`,
        importId: item.import.id,
        potId: item.pot.id,
        potName: item.pot.name,
        potProvider: item.pot.provider,
        potEmoji:
          typeof item.pot.emoji === 'string' && item.pot.emoji.trim().length > 0
            ? item.pot.emoji
            : FALLBACK_POT_EMOJI,
        fileName: item.import.fileName,
        status,
        updatedAt: item.import.updatedAt,
        errorMessage: item.import.errorMessage,
        title: toNotificationTitle(status),
        body: toNotificationBody(item, status),
        unread,
        actionable,
        source: item,
      };
    });
}

export function buildNotificationStatusCounts(
  notifications: ImportNotificationItem[],
): NotificationStatusCounts {
  const counts: NotificationStatusCounts = {
    queuing: 0,
    processing: 0,
    ready: 0,
    failed: 0,
  };

  for (const notification of notifications) {
    counts[notification.status] += 1;
  }

  return counts;
}

export function toRelativeTime(isoDate: string): string {
  const timestamp = new Date(isoDate).valueOf();
  if (Number.isNaN(timestamp)) return '';

  const diffSeconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (diffSeconds < 60) return `${diffSeconds}s ago`;

  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes}m ago`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}
