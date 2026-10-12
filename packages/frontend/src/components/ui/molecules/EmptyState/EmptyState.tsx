import type { LucideIcon } from 'lucide-react';
import { Plus } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '../../atoms';
import type { ButtonProps } from '../../atoms';

type EmptyStateAction = {
  label: string;
  onClick: () => void;
  icon?: ReactNode;
  variant?: ButtonProps['variant'];
  size?: ButtonProps['size'];
  className?: string;
};

export type EmptyStateProps = {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: EmptyStateAction;
  compact?: boolean;
  tone?: 'brand' | 'neutral';
  className?: string;
  titleClassName?: string;
  descriptionClassName?: string;
};

// The icon is a small glyph beside the title, not a tinted tile.
const TONE_ICON_CLASSES = {
  brand: 'text-brand',
  neutral: 'text-fg-faint',
} as const;

const EMPTY_STATE_ICON_SIZE = 16;
const ACTION_ICON_SIZE = 14;

// A dashed, left-aligned box: title, one line of text, then at most one button.
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  compact = false,
  tone = 'brand',
  className,
  titleClassName,
  descriptionClassName,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex w-full flex-col items-start rounded-lg border border-dashed border-border-control bg-surface text-left',
        compact ? 'p-4' : 'px-4 py-6',
        className,
      )}
    >
      <div className="flex items-start gap-2">
        <Icon
          size={EMPTY_STATE_ICON_SIZE}
          className={cn('mt-0.5 shrink-0', TONE_ICON_CLASSES[tone])}
          aria-hidden="true"
        />
        <h3 className={cn('text-body font-semibold text-fg', titleClassName)}>{title}</h3>
      </div>
      <p className={cn('mt-1 text-cell text-fg-muted', descriptionClassName)}>{description}</p>
      {action && (
        <Button
          onClick={action.onClick}
          variant={action.variant ?? 'primary'}
          size={action.size ?? 'md'}
          leadingIcon={action.icon ?? <Plus size={ACTION_ICON_SIZE} />}
          className={cn('mt-3', action.className)}
        >
          {action.label}
        </Button>
      )}
    </div>
  );
}
