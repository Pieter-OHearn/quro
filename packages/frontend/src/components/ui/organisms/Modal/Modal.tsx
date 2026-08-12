import { X } from 'lucide-react';
import { useEffect, useId, useRef } from 'react';
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
  titleId?: string;
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
const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function getActiveElement(): HTMLElement | null {
  return typeof document !== 'undefined' && document.activeElement instanceof HTMLElement
    ? document.activeElement
    : null;
}

function useModalFocusTrap(
  dialogRef: React.RefObject<HTMLDivElement | null>,
  returnFocusRef: React.RefObject<HTMLElement | null>,
  onClose: () => void,
) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const previouslyFocused = returnFocusRef.current;
    const dialog = dialogRef.current;
    if (!dialog) return;

    const focusableElements = () =>
      Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        (element) => !element.hasAttribute('hidden'),
      );

    (focusableElements()[0] ?? dialog).focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab') return;

      const elements = focusableElements();
      if (elements.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      queueMicrotask(() => {
        if (previouslyFocused && document.body.contains(previouslyFocused)) {
          previouslyFocused.focus();
        }
      });
    };
  }, [dialogRef, returnFocusRef]);
}

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
  titleId,
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
            aria-label="Close dialog"
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
            <h2 id={titleId} className={cn('font-bold text-fg-inverted', titleClassName)}>
              {title}
            </h2>
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
            <h2 id={titleId} className={cn('font-bold text-fg-inverted', titleClassName)}>
              {title}
            </h2>
            {subtitle && (
              <p className={cn('text-xs text-brand-border mt-0.5', subtitleClassName)}>
                {subtitle}
              </p>
            )}
          </div>
          <button
            type="button"
            aria-label="Close dialog"
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
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(getActiveElement());
  useModalFocusTrap(dialogRef, returnFocusRef, onClose);

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
        ref={dialogRef}
        className={cn(
          'relative bg-surface rounded-2xl shadow-overlay w-full overflow-hidden',
          MAX_WIDTH_MAP[maxWidth],
          scrollable && 'flex flex-col max-h-[90vh]',
          contentClassName,
        )}
        role="dialog"
        aria-modal="true"
        aria-labelledby={header ? undefined : titleId}
        aria-label={header ? (typeof title === 'string' ? title : 'Dialog') : undefined}
        tabIndex={-1}
      >
        {header ?? (
          <ModalHeader
            title={title}
            subtitle={subtitle}
            onClose={onClose}
            scrollable={scrollable}
            titleId={titleId}
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
