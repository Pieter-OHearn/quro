import type { ImportNotificationItem } from './types';
import { NotificationItem } from './NotificationItem';

type NotificationListProps = {
  notifications: ImportNotificationItem[];
  onAction: (item: ImportNotificationItem) => void;
};

export function NotificationList({ notifications, onAction }: Readonly<NotificationListProps>) {
  return (
    <ul className="max-h-[420px] overflow-y-auto divide-y divide-slate-100">
      {notifications.map((notification) => (
        <NotificationItem key={notification.id} item={notification} onAction={onAction} />
      ))}
    </ul>
  );
}
