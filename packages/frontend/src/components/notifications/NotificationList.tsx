import type { NotificationItem as NotificationItemType } from './types';
import { NotificationItem } from './NotificationItem';

type NotificationListProps = {
  notifications: NotificationItemType[];
  onAction: (item: NotificationItemType) => void;
  onDismiss: (item: NotificationItemType) => void;
};

export function NotificationList({
  notifications,
  onAction,
  onDismiss,
}: Readonly<NotificationListProps>) {
  return (
    <ul className="max-h-[420px] overflow-y-auto divide-y divide-slate-100">
      {notifications.map((notification) => (
        <NotificationItem
          key={notification.id}
          item={notification}
          onAction={onAction}
          onDismiss={onDismiss}
        />
      ))}
    </ul>
  );
}
