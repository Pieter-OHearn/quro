import type { PensionStatementImportFeedItem } from '@quro/shared';

export type NotificationStatus = 'queuing' | 'processing' | 'ready' | 'failed';

export type ImportNotificationItem = {
  id: string;
  importId: number;
  potId: number;
  potName: string;
  potProvider: string;
  potEmoji: string;
  fileName: string;
  status: NotificationStatus;
  updatedAt: string;
  errorMessage: string | null;
  title: string;
  body: string;
  unread: boolean;
  actionable: boolean;
  source: PensionStatementImportFeedItem;
};

export type NotificationStatusCounts = Record<NotificationStatus, number>;
