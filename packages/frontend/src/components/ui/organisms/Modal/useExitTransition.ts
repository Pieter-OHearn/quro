import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

// Calls `onExited` if `transitionend` never fires, for example in a hidden tab or when the
// browser skips transitions.
const FALLBACK_EXIT_MS = 600;

type UseExitTransitionOptions = {
  panelRef: RefObject<HTMLElement | null>;
  open: boolean;
  onExited?: () => void;
};

/**
 * Reports the end of a dialog's closing transition. While `open` is false the dialog stays
 * mounted (the dialog sets `data-closing` on its layers and makes the root inert); `onExited`
 * runs once, when the panel has faded out or after a short fallback, and the caller unmounts it.
 */
export function useExitTransition({ panelRef, open, onExited }: UseExitTransitionOptions) {
  const onExitedRef = useRef(onExited);
  onExitedRef.current = onExited;

  useEffect(() => {
    if (open) return undefined;
    const panel = panelRef.current;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      window.clearTimeout(fallback);
      onExitedRef.current?.();
    };
    const fallback = window.setTimeout(finish, FALLBACK_EXIT_MS);
    const handleEnd = (event: TransitionEvent) => {
      if (event.target === panel && event.propertyName === 'opacity') finish();
    };
    panel?.addEventListener('transitionend', handleEnd);
    return () => {
      done = true;
      window.clearTimeout(fallback);
      panel?.removeEventListener('transitionend', handleEnd);
    };
  }, [open, panelRef]);
}

/**
 * Keeps a dialog mounted until its closing transition has ended. Pass `open` to the dialog and
 * `onExited` to its `onExited`, and render it only while `mounted`:
 *
 *     const presence = useModalPresence(isOpen);
 *     {presence.mounted && <Modal open={presence.open} onExited={presence.onExited} ... />}
 */
export function useModalPresence(open: boolean) {
  const [mounted, setMounted] = useState(open);
  if (open && !mounted) setMounted(true);
  const openRef = useRef(open);
  openRef.current = open;
  // Reopening during the closing transition keeps the same instance, so nothing is replayed.
  const onExited = useCallback(() => {
    if (!openRef.current) setMounted(false);
  }, []);
  return { mounted: mounted || open, open, onExited };
}
