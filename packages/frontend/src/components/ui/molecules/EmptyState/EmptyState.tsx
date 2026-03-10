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

const TONE_CLASSES = {
  brand: {
    iconWrapper: 'bg-indigo-50',
    icon: 'text-indigo-300',
  },
  neutral: {
    iconWrapper: 'bg-slate-100',
    icon: 'text-slate-300',
  },
} as const;

const COMPACT_ACTION_ICON_SIZE = 14;
const DEFAULT_ACTION_ICON_SIZE = 15;
const COMPACT_EMPTY_STATE_ICON_SIZE = 20;
const DEFAULT_EMPTY_STATE_ICON_SIZE = 28;

function getActionIcon(icon: ReactNode | undefined, compact: boolean) {
  return icon ?? <Plus size={compact ? COMPACT_ACTION_ICON_SIZE : DEFAULT_ACTION_ICON_SIZE} />;
}

function getTitleClasses(compact: boolean, titleClassName?: string) {
  return cn(
    compact ? 'text-sm font-medium text-slate-500' : 'mb-1 font-semibold text-slate-800',
    titleClassName,
  );
}

function getDescriptionClasses(
  compact: boolean,
  hasAction: boolean,
  descriptionClassName?: string,
) {
  return cn(
    compact
      ? hasAction
        ? 'mt-1 mb-4 text-xs text-slate-400'
        : 'mt-1 text-xs text-slate-400'
      : 'mb-6 max-w-xs text-sm text-slate-400',
    descriptionClassName,
  );
}

function getActionSize(compact: boolean, size?: ButtonProps['size']) {
  return size ?? (compact ? 'md' : 'lg');
}

function getActionClassName(compact: boolean, className?: string) {
  return cn(!compact && 'px-5 transition-all', className);
}

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
  const tones = TONE_CLASSES[tone];
  const hasAction = Boolean(action);
  const actionIcon = action ? getActionIcon(action.icon, compact) : undefined;
  const titleClasses = getTitleClasses(compact, titleClassName);
  const descriptionClasses = getDescriptionClasses(compact, hasAction, descriptionClassName);

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center',
        compact ? 'px-4 py-10' : 'px-6 py-20',
        className,
      )}
    >
      <div
        className={cn(
          'flex items-center justify-center rounded-2xl',
          compact ? 'mb-3 h-12 w-12' : 'mb-4 h-16 w-16',
          tones.iconWrapper,
        )}
      >
        <Icon
          size={compact ? COMPACT_EMPTY_STATE_ICON_SIZE : DEFAULT_EMPTY_STATE_ICON_SIZE}
          className={tones.icon}
        />
      </div>
      <h3 className={titleClasses}>{title}</h3>
      <p className={descriptionClasses}>{description}</p>
      {action && (
        <Button
          onClick={action.onClick}
          variant={action.variant ?? 'primary'}
          size={getActionSize(compact, action.size)}
          leadingIcon={actionIcon}
          className={getActionClassName(compact, action.className)}
        >
          {action.label}
        </Button>
      )}
    </div>
  );
}
