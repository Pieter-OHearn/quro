import type { PensionStatementImportFeedItem } from '@quro/shared';

export type NotificationStatus = 'queuing' | 'processing' | 'ready' | 'failed';

type BaseNotificationItem = {
  id: string;
  status: NotificationStatus | 'reminder';
  updatedAt: string;
  timeLabel?: string;
  title: string;
  body: string;
  unread: boolean;
  actionable: boolean;
  dismissible: boolean;
};

export type ImportNotificationItem = BaseNotificationItem & {
  kind: 'import';
  importId: number;
  potId: number;
  potName: string;
  potProvider: string;
  potEmoji: string;
  fileName: string;
  errorMessage: string | null;
  source: PensionStatementImportFeedItem;
};

export type MortgageNotificationItem = BaseNotificationItem & {
  kind: 'mortgage_expiry';
  status: 'reminder';
  mortgageId: number;
  dismissalKey: string;
};

export type NotificationItem = ImportNotificationItem | MortgageNotificationItem;

export type NotificationStatusCounts = Record<NotificationItem['status'], number>;
