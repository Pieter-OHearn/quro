import { useLayoutEffect, useRef, type RefObject } from 'react';

const RESTORE_POLL_MS = 100;
const RESTORE_GIVE_UP_MS = 2000;
const TOLERANCE_PX = 1;
const USER_INPUT_EVENTS = ['wheel', 'touchstart', 'pointerdown', 'keydown'] as const;

/**
 * Remembers the scroll position of a scroll container per key (the route), so returning to a page
 * through the tab bar or the sidebar puts it back where it was, and a page that was never visited
 * starts at the top instead of inheriting the previous page's offset. A page whose content loads
 * after navigation is given a moment to grow tall enough; the restore stops as soon as the person
 * scrolls.
 */
export function useScrollMemory(containerRef: RefObject<HTMLElement | null>, key: string): void {
  const positions = useRef(new Map<string, number>());
  const currentKey = useRef(key);

  // The new page renders in the commit after this render, so the container still holds the old
  // page's scroll position here, and reading it needs no scroll listener.
  if (currentKey.current !== key) {
    const container = containerRef.current;
    if (container) positions.current.set(currentKey.current, container.scrollTop);
    currentKey.current = key;
  }

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;
    const target = positions.current.get(key) ?? 0;
    container.scrollTop = target;
    const reached = () => Math.abs(container.scrollTop - target) <= TOLERANCE_PX;
    if (reached()) return undefined;

    // The page is not tall enough yet: keep trying while it loads.
    const stop = () => {
      window.clearInterval(poll);
      window.clearTimeout(giveUp);
      for (const type of USER_INPUT_EVENTS) container.removeEventListener(type, stop);
    };
    const poll = window.setInterval(() => {
      container.scrollTop = target;
      if (reached()) stop();
    }, RESTORE_POLL_MS);
    const giveUp = window.setTimeout(stop, RESTORE_GIVE_UP_MS);
    for (const type of USER_INPUT_EVENTS) {
      container.addEventListener(type, stop, { passive: true });
    }
    return stop;
  }, [containerRef, key]);
}
