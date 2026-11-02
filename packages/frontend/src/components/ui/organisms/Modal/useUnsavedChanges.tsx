import { useEffect, useRef, useState, type RefObject } from 'react';
import { useBlocker, type Blocker } from 'react-router';

/**
 * Whether the user has edited a field inside `containerRef` since it became active: the first
 * `input` or `change` event from a field in it (typing, a select, a checkbox, a date or a file)
 * marks it dirty. It starts clean each time `active` turns true.
 */
export function useEditedSinceOpen(
  containerRef: RefObject<HTMLElement | null>,
  active: boolean,
): boolean {
  const [edited, setEdited] = useState(false);
  const [wasActive, setWasActive] = useState(active);
  if (active !== wasActive) {
    setWasActive(active);
    if (active) setEdited(false);
  }

  useEffect(() => {
    const container = containerRef.current;
    if (!active || edited || !container) return undefined;
    const markEdited = () => {
      setEdited(true);
    };
    container.addEventListener('input', markEdited);
    container.addEventListener('change', markEdited);
    return () => {
      container.removeEventListener('input', markEdited);
      container.removeEventListener('change', markEdited);
    };
  }, [containerRef, active, edited]);

  return edited;
}

/** Asks the browser to confirm before the page is closed or reloaded while `when` holds. */
export function useBeforeUnloadWarning(when: boolean) {
  useEffect(() => {
    if (!when) return undefined;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => {
      window.removeEventListener('beforeunload', warn);
    };
  }, [when]);
}

/**
 * Holds back in-app navigation (the browser's back button, a link) while it is mounted and hands
 * the held navigation to `onBlocked`, which proceeds or resets it. Render it only while there are
 * unsaved edits; it needs the app's data router.
 */
export function NavigationBlocker({
  onBlocked,
}: Readonly<{ onBlocked: (blocker: Blocker) => void }>) {
  const blocker = useBlocker(true);
  const onBlockedRef = useRef(onBlocked);
  onBlockedRef.current = onBlocked;
  // The router hands out a new blocker object for each held navigation and keeps it between
  // renders, so each one is reported once.
  useEffect(() => {
    if (blocker.state === 'blocked') onBlockedRef.current(blocker);
  }, [blocker]);
  return null;
}
