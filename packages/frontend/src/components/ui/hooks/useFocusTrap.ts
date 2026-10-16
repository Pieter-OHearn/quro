import { useEffect, useRef, type RefObject } from 'react';

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Open traps, innermost last. Only the innermost one handles Escape and Tab, so Escape in a dialog
// opened from another dialog closes only the inner one.
const openTraps: symbol[] = [];

function getActiveElement(): HTMLElement | null {
  return typeof document !== 'undefined' && document.activeElement instanceof HTMLElement
    ? document.activeElement
    : null;
}

function focusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) => !element.hasAttribute('hidden') && !element.closest('[inert]'),
  );
}

function keepTabInside(event: KeyboardEvent, container: HTMLElement) {
  const elements = focusableElements(container);
  if (elements.length === 0) {
    event.preventDefault();
    container.focus();
    return;
  }
  const first = elements[0];
  const last = elements[elements.length - 1];
  const current = document.activeElement;
  if (!container.contains(current)) {
    event.preventDefault();
    (event.shiftKey ? last : first).focus();
  } else if (event.shiftKey && (current === first || current === container)) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && current === last) {
    event.preventDefault();
    first.focus();
  }
}

export type UseFocusTrapOptions = {
  /** The dialog, drawer or panel that keeps focus while the trap is active. */
  containerRef: RefObject<HTMLElement | null>;
  /** Whether the overlay is open. Focus moves in when this turns true and back when it turns false. */
  active: boolean;
  /** Called on Escape, unless a trap opened after this one is still active. */
  onEscape: () => void;
  /** Receives focus on open instead of the first focusable element. */
  initialFocusRef?: RefObject<HTMLElement | null>;
};

/**
 * The focus behaviour every overlay shares (dialogs, sheets, the navigation drawer and header
 * panels): on open, focus moves to `initialFocusRef` or the first focusable element; Tab and
 * Shift+Tab cycle inside the container; Escape calls `onEscape`; on close, focus returns to the
 * element that had it when the overlay opened, if it is still in the document.
 *
 * The element to return to is read while rendering the opening update, before a child with
 * `autoFocus` can take focus during the commit.
 */
export function useFocusTrap({
  containerRef,
  active,
  onEscape,
  initialFocusRef,
}: UseFocusTrapOptions): void {
  const onEscapeRef = useRef(onEscape);
  onEscapeRef.current = onEscape;
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const wasActiveRef = useRef(false);
  if (active && !wasActiveRef.current) returnFocusRef.current = getActiveElement();
  wasActiveRef.current = active;

  useEffect(() => {
    const container = containerRef.current;
    if (!active || !container) return undefined;

    const id = Symbol('focus-trap');
    openTraps.push(id);
    const previouslyFocused = returnFocusRef.current;

    // A panel may still be entering from beyond the viewport; scrolling to it would shift its
    // overlay and leave a gap.
    const initial = initialFocusRef?.current ?? focusableElements(container)[0] ?? container;
    const focusInitial = () => {
      if (!container.contains(document.activeElement) || initialFocusRef?.current) {
        initial.focus({ preventScroll: true });
      }
    };
    focusInitial();
    // A panel that is still `visibility: hidden` when it opens (a drawer fading in) cannot take
    // focus yet, so try once more on the next frame.
    const retry = window.requestAnimationFrame(() => {
      if (!container.contains(document.activeElement)) initial.focus({ preventScroll: true });
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (openTraps[openTraps.length - 1] !== id) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        onEscapeRef.current();
      } else if (event.key === 'Tab') {
        keepTabInside(event, container);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      window.cancelAnimationFrame(retry);
      document.removeEventListener('keydown', handleKeyDown);
      const index = openTraps.indexOf(id);
      if (index !== -1) openTraps.splice(index, 1);
      queueMicrotask(() => {
        if (previouslyFocused?.isConnected) previouslyFocused.focus({ preventScroll: true });
      });
    };
  }, [active, containerRef, initialFocusRef]);
}
