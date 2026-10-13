import { Loader2 } from 'lucide-react';
import { Badge, PanelHeader } from '@/components/ui';

type NotificationPanelHeaderProps = {
  totalCount: number;
  isFetching: boolean;
};

export function NotificationPanelHeader({
  totalCount,
  isFetching,
}: Readonly<NotificationPanelHeaderProps>) {
  return (
    <PanelHeader
      title={
        <span className="inline-flex items-center gap-2">
          Notifications
          {totalCount > 0 && <Badge className="font-numeric">{totalCount}</Badge>}
        </span>
      }
      action={
        isFetching ? (
          <Loader2
            size={14}
            className="animate-spin text-fg-subtle"
            role="img"
            aria-label="Refreshing notifications"
          />
        ) : undefined
      }
    />
  );
}
