import { Bell } from 'lucide-react';
import { EmptyState } from '@/components/ui';

export function NotificationEmptyState() {
  return (
    <EmptyState
      icon={Bell}
      title="All caught up!"
      description="Background jobs will appear here."
      compact
      tone="neutral"
    />
  );
}
