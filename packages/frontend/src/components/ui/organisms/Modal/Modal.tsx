import { X } from 'lucide-react';
import {
  useCallback,
  useContext,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from 'react';
import type { Blocker } from 'react-router';
import { cn } from '@/lib/utils';
import { Button } from '../../atoms';
import { useFocusTrap, useVisualViewport, type VisualViewportBox } from '../../hooks';
import { ModalPresenceContext } from './ModalPresence';
import { useExitTransition } from './useExitTransition';
import { NavigationBlocker, useBeforeUnloadWarning, useEditedSinceOpen } from './useUnsavedChanges';

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
  /**
   * Whether the dialog is shown. Inside a `ModalPresence` it follows the presence, which keeps the
   * dialog mounted until its closing transition has ended; otherwise it defaults to true. Pass it
   * with `onExited` to drive the transition yourself (`useModalPresence`).
   */
  open?: boolean;
  /** Called once the closing transition has ended after `open` turned false. */
  onExited?: () => void;
  /**
   * Ask before closing a dialog whose fields were edited (on by default): the close button,
   * Escape, the scrim, the browser's back button and leaving the page ask to discard the changes.
   * A Cancel button is the explicit way to discard and closes at once. Turn it off for a dialog
   * with nothing to lose, such as signing in.
   */
  confirmDiscard?: boolean;
  maxWidth?: keyof typeof MAX_WIDTH_MAP;
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
  '3xl': 'max-w-3xl',
} as const;

const DEFAULT_CLOSE_ICON_SIZE = 16;
// A 44px header with the title in the section title style, on the dialog surface.
const HEADER_CLASS_NAME =
  'flex min-h-11 items-center justify-between gap-3 border-b border-border-default px-4 py-2';
const TITLE_CLASS_NAME = 'text-title-section text-fg';
const SUBTITLE_CLASS_NAME = 'text-caption text-fg-subtle';
const CLOSE_BUTTON_CLASS_NAME =
  'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-fg-muted transition-colors duration-fast hover:bg-surface-muted hover:text-fg active:bg-surface-muted active:text-fg max-sm:h-11 max-sm:w-11 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus-ring';

// The scrim and the panel fade in over `duration-base`. Below 640px the panel is a bottom sheet
// that rises from the bottom edge; under reduced motion it only fades. `data-closing` is set on
// both layers while the dialog is closing (see useExitTransition).
const SCRIM_CLASS_NAME =
  'absolute -inset-4 bg-scrim transition-opacity duration-base ease-standard starting:opacity-0 data-closing:opacity-0';
const PANEL_CLASS_NAME = cn(
  'relative w-full overflow-hidden rounded-lg border border-border-default bg-surface shadow-overlay',
  'transition-[opacity,translate] duration-base ease-standard starting:opacity-0 data-closing:opacity-0',
  'motion-safe:max-sm:starting:translate-y-full motion-safe:max-sm:data-closing:translate-y-full',
  'max-sm:max-h-[calc(100%-0.5rem)] max-sm:max-w-none max-sm:rounded-b-none max-sm:rounded-t-xl max-sm:border-x-0 max-sm:border-b-0',
);
// Footer actions sit at the end on desktop. On phones they share one 44px row, so the sticky bar
// stays short enough to leave room for fields above a virtual keyboard; a danger action takes a
// row of its own above them.
const FOOTER_CLASS_NAME =
  'flex justify-end gap-2 border-t border-border-default bg-surface-sunken px-4 py-3 max-sm:sticky max-sm:bottom-0 max-sm:flex-wrap max-sm:pb-[max(0.75rem,env(safe-area-inset-bottom))] max-sm:*:h-11 max-sm:*:min-w-[calc(50%-0.25rem)] max-sm:*:flex-1';

type DiscardRequest = { discard: () => void; keep?: () => void };

/**
 * The unsaved-changes guard: a dialog whose fields were edited asks before it closes or the page
 * is left. `confirming` shows the question in place of the footer.
 */
function useDiscardGuard(
  dialogRef: RefObject<HTMLDivElement | null>,
  open: boolean,
  enabled: boolean,
) {
  const edited = useEditedSinceOpen(dialogRef, open && enabled) && open && enabled;
  const [request, setRequest] = useState<DiscardRequest | null>(null);
  useBeforeUnloadWarning(edited);

  const confirmClose = useCallback(
    (close: () => void) => {
      if (edited) setRequest({ discard: close });
      else close();
    },
    [edited],
  );
  const onNavigationBlocked = useCallback((blocker: Blocker) => {
    setRequest({ discard: () => blocker.proceed?.(), keep: () => blocker.reset?.() });
  }, []);
  const keepEditing = () => {
    request?.keep?.();
    setRequest(null);
  };
  const discardChanges = () => {
    setRequest(null);
    request?.discard();
  };

  return {
    edited,
    confirming: request !== null,
    confirmClose,
    onNavigationBlocked,
    keepEditing,
    discardChanges,
  };
}

// Asks in the footer's place, on the sticky bar, with "Keep editing" focused so Enter keeps the
// edits; Escape keeps them too.
function DiscardChangesBar({
  onKeep,
  onDiscard,
}: Readonly<{ onKeep: () => void; onDiscard: () => void }>) {
  return (
    <div className={cn(FOOTER_CLASS_NAME, 'items-center')}>
      <p role="alert" className="mr-auto flex items-center text-cell text-fg max-sm:basis-full!">
        Discard your changes?
      </p>
      <Button variant="secondary" onClick={onKeep} autoFocus>
        Keep editing
      </Button>
      <Button variant="dangerSolid" onClick={onDiscard}>
        Discard changes
      </Button>
    </div>
  );
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
  const heading = (
    <>
      {visual}
      <h2 id={titleId} className={cn(TITLE_CLASS_NAME, titleClassName)}>
        {title}
      </h2>
      {subtitle && <p className={cn(SUBTITLE_CLASS_NAME, subtitleClassName)}>{subtitle}</p>}
    </>
  );
  const closeButton = (
    <button
      type="button"
      aria-label="Close dialog"
      onClick={onClose}
      className={cn(
        CLOSE_BUTTON_CLASS_NAME,
        isCentered && 'absolute right-2 top-1.5 max-sm:right-0 max-sm:top-0',
        closeButtonClassName,
      )}
    >
      <X size={closeIconSize} />
    </button>
  );

  return (
    <div
      className={cn(
        HEADER_CLASS_NAME,
        scrollable && 'flex-shrink-0',
        isCentered && 'relative block px-12 text-center',
        className,
      )}
    >
      {isCentered ? (
        <>
          {closeButton}
          <div className={cn('min-w-0 flex flex-col items-center', contentClassName)}>
            {heading}
          </div>
        </>
      ) : (
        <>
          <div className={cn('min-w-0', contentClassName)}>{heading}</div>
          {closeButton}
        </>
      )}
    </div>
  );
}

// A custom header has no title element to point at, so the dialog is named from the title text.
function dialogNameProps(hasCustomHeader: boolean, title: React.ReactNode, titleId: string) {
  if (!hasCustomHeader) return { 'aria-labelledby': titleId };
  return { 'aria-label': typeof title === 'string' ? title : 'Dialog' };
}

function keyboardOverlayStyle(box: VisualViewportBox | null): CSSProperties | undefined {
  return box ? { top: box.top, bottom: 'auto', height: box.height } : undefined;
}

/**
 * Whether the dialog is open (its own `open`, else its `ModalPresence`, else true), and the close
 * request that goes through the unsaved-changes guard. Wires the focus trap and exit transition.
 */
function useModalState(
  dialogRef: RefObject<HTMLDivElement | null>,
  { open: openProp, onExited: onExitedProp, confirmDiscard = true, onClose }: ModalProps,
) {
  const presence = useContext(ModalPresenceContext);
  const open = openProp ?? presence?.open ?? true;
  const guard = useDiscardGuard(dialogRef, open, confirmDiscard);
  const requestClose = () => {
    guard.confirmClose(onClose);
  };
  useFocusTrap({
    containerRef: dialogRef,
    active: open,
    onEscape: guard.confirming ? guard.keepEditing : requestClose,
  });
  useExitTransition({ panelRef: dialogRef, open, onExited: onExitedProp ?? presence?.onExited });
  return { open, guard, requestClose };
}

type ModalContentProps = Pick<
  ModalProps,
  | 'title'
  | 'subtitle'
  | 'children'
  | 'footer'
  | 'scrollable'
  | 'header'
  | 'headerProps'
  | 'bodyClassName'
> & {
  titleId: string;
  guard: ReturnType<typeof useDiscardGuard>;
  requestClose: () => void;
};

// The header, body and footer, or the discard question in the footer's place. A dialog opened
// from inside this one does not inherit this one's presence.
function ModalContent({
  title,
  subtitle,
  children,
  footer,
  scrollable,
  header,
  headerProps,
  bodyClassName,
  titleId,
  guard,
  requestClose,
}: Readonly<ModalContentProps>) {
  const footerBar = footer ? (
    <div className={cn(FOOTER_CLASS_NAME, scrollable && 'flex-shrink-0')}>{footer}</div>
  ) : null;
  return (
    <ModalPresenceContext.Provider value={null}>
      {header ?? (
        <ModalHeader
          title={title}
          subtitle={subtitle}
          onClose={requestClose}
          scrollable={scrollable}
          titleId={titleId}
          {...headerProps}
        />
      )}
      <div
        className={cn('p-4 space-y-4 text-body', scrollable && 'overflow-y-auto', bodyClassName)}
      >
        {children}
      </div>
      {guard.confirming ? (
        <DiscardChangesBar onKeep={guard.keepEditing} onDiscard={guard.discardChanges} />
      ) : (
        footerBar
      )}
    </ModalPresenceContext.Provider>
  );
}

export function Modal(props: ModalProps) {
  const { title, maxWidth = 'md', scrollable, header, backdropClassName, contentClassName } = props;
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const { open, guard, requestClose } = useModalState(dialogRef, props);
  // While a virtual keyboard covers the page the overlay is sized to what is still visible.
  const visibleBox = useVisualViewport(open);

  return (
    <div
      inert={!open}
      style={keyboardOverlayStyle(visibleBox)}
      className="fixed inset-0 z-50 flex h-dvh w-screen items-center justify-center overflow-clip p-4 max-sm:items-end max-sm:px-0 max-sm:pb-0"
    >
      <div
        data-closing={open ? undefined : ''}
        className={cn(SCRIM_CLASS_NAME, backdropClassName)}
        onClick={requestClose}
      />
      <div
        ref={dialogRef}
        data-closing={open ? undefined : ''}
        className={cn(
          PANEL_CLASS_NAME,
          MAX_WIDTH_MAP[maxWidth],
          scrollable ? 'flex flex-col max-h-[90vh]' : 'max-sm:overflow-y-auto',
          contentClassName,
        )}
        role="dialog"
        aria-modal="true"
        {...dialogNameProps(Boolean(header), title, titleId)}
        tabIndex={-1}
      >
        <ModalContent {...props} titleId={titleId} guard={guard} requestClose={requestClose} />
        {guard.edited && <NavigationBlocker onBlocked={guard.onNavigationBlocked} />}
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
      {danger ? (
        <div className="mr-auto flex max-sm:order-first max-sm:mr-0 max-sm:basis-full max-sm:*:flex-1">
          {danger}
        </div>
      ) : null}
      <Button onClick={onCancel} variant="secondary">
        {cancelLabel}
      </Button>
      <Button
        onClick={onConfirm}
        disabled={disabled}
        variant="primary"
        loading={loading}
        loadingLabel="Saving..."
      >
        {confirmLabel}
      </Button>
    </>
  );
}
