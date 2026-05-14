import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '../../atoms';

export type ModalHeaderProps = {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  onClose: () => void;
  scrollable?: boolean;
  align?: 'start' | 'center';
  visual?: React.ReactNode;
  className?: string;
  contentClassName?: string;
  titleClassName?: string;
  subtitleClassName?: string;
  closeButtonClassName?: string;
  closeIconSize?: number;
};

export type ModalProps = {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  onClose: () => void;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl';
  children: React.ReactNode;
  footer?: React.ReactNode;
  scrollable?: boolean;
  header?: React.ReactNode;
  headerProps?: Omit<ModalHeaderProps, 'title' | 'subtitle' | 'onClose' | 'scrollable'>;
  backdropClassName?: string;
  contentClassName?: string;
  bodyClassName?: string;
};

const MAX_WIDTH_MAP = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
} as const;

const DEFAULT_CLOSE_ICON_SIZE = 18;

export function ModalHeader({
  title,
  subtitle,
  onClose,
  scrollable,
  align = 'start',
  visual,
  className,
  contentClassName,
  titleClassName,
  subtitleClassName,
  closeButtonClassName,
  closeIconSize = DEFAULT_CLOSE_ICON_SIZE,
}: ModalHeaderProps) {
  const isCentered = align === 'center';

  return (
    <div
      className={cn(
        'bg-gradient-to-r from-surface-inverse to-surface-inverse-raised px-6 py-5 flex items-center justify-between',
        scrollable && 'flex-shrink-0',
        isCentered && 'relative block text-center',
        className,
      )}
    >
      {isCentered ? (
        <>
          <button
            type="button"
            onClick={onClose}
            className={cn(
              'absolute top-4 right-4 p-2 rounded-xl hover:bg-fg-inverted/10 text-fg-faint hover:text-fg-inverted transition-colors',
              closeButtonClassName,
            )}
          >
            <X size={closeIconSize} />
          </button>
          <div className={cn('min-w-0 flex flex-col items-center', contentClassName)}>
            {visual}
            <h2 className={cn('font-bold text-fg-inverted', titleClassName)}>{title}</h2>
            {subtitle && (
              <p className={cn('text-xs text-brand-border mt-0.5', subtitleClassName)}>
                {subtitle}
              </p>
            )}
          </div>
        </>
      ) : (
        <>
          <div className={cn('min-w-0 pr-4', contentClassName)}>
            {visual}
            <h2 className={cn('font-bold text-fg-inverted', titleClassName)}>{title}</h2>
            {subtitle && (
              <p className={cn('text-xs text-brand-border mt-0.5', subtitleClassName)}>
                {subtitle}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className={cn(
              'p-2 rounded-xl hover:bg-fg-inverted/10 text-fg-faint hover:text-fg-inverted transition-colors',
              closeButtonClassName,
            )}
          >
            <X size={closeIconSize} />
          </button>
        </>
      )}
    </div>
  );
}

export function Modal({
  title,
  subtitle,
  onClose,
  maxWidth = 'md',
  children,
  footer,
  scrollable,
  header,
  headerProps,
  backdropClassName,
  contentClassName,
  bodyClassName,
}: ModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex h-dvh w-screen items-center justify-center overflow-hidden p-4">
      <div
        className={cn(
          'absolute -inset-4 bg-surface-inverse/40 backdrop-blur-sm',
          backdropClassName,
        )}
        onClick={onClose}
      />
      <div
        className={cn(
          'relative bg-surface rounded-2xl shadow-overlay w-full overflow-hidden',
          MAX_WIDTH_MAP[maxWidth],
          scrollable && 'flex flex-col max-h-[90vh]',
          contentClassName,
        )}
        role="dialog"
        aria-modal="true"
      >
        {header ?? (
          <ModalHeader
            title={title}
            subtitle={subtitle}
            onClose={onClose}
            scrollable={scrollable}
            {...headerProps}
          />
        )}
        <div className={cn('p-6 space-y-5', scrollable && 'overflow-y-auto', bodyClassName)}>
          {children}
        </div>
        {footer && (
          <div
            className={cn(
              'px-6 py-4 bg-surface-sunken border-t border-border-subtle flex gap-3',
              scrollable && 'flex-shrink-0',
            )}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

export type ModalFooterProps = {
  onCancel: () => void;
  onConfirm: () => void;
  confirmLabel?: string;
  cancelLabel?: string;
  disabled?: boolean;
  loading?: boolean;
  danger?: React.ReactNode;
};

export function ModalFooter({
  onCancel,
  onConfirm,
  confirmLabel = 'Save',
  cancelLabel = 'Cancel',
  disabled,
  loading,
  danger,
}: ModalFooterProps) {
  return (
    <>
      {danger}
      <Button onClick={onCancel} variant="secondary" size="lg" className="flex-1">
        {cancelLabel}
      </Button>
      <Button
        onClick={onConfirm}
        disabled={disabled}
        variant="primary"
        size="lg"
        loading={loading}
        loadingLabel="Saving..."
        className="flex-1"
      >
        {confirmLabel}
      </Button>
    </>
  );
}
