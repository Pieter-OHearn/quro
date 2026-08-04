import { Bell } from 'lucide-react';
import { EmptyState } from '@/components/ui';

export function NotificationEmptyState() {
  return (
    <EmptyState
      icon={Bell}
      title="All caught up!"
      description="Background jobs and timely reminders will appear here."
      compact
      tone="neutral"
    />
  );
}
