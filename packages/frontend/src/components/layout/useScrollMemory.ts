import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';

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
  const keyRef = useRef(key);
  const tracking = useRef(false);
  keyRef.current = key;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;
    const handleScroll = () => {
      if (tracking.current) positions.current.set(keyRef.current, container.scrollTop);
    };
    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, [containerRef]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;
    const target = positions.current.get(key) ?? 0;
    tracking.current = false;
    container.scrollTop = target;
    const reached = () => Math.abs(container.scrollTop - target) <= TOLERANCE_PX;
    if (reached()) {
      tracking.current = true;
      return undefined;
    }

    // The page is not tall enough yet: keep trying while it loads.
    const stop = () => {
      window.clearInterval(poll);
      window.clearTimeout(giveUp);
      for (const type of USER_INPUT_EVENTS) container.removeEventListener(type, stop);
      tracking.current = true;
    };
    const poll = window.setInterval(() => {
      container.scrollTop = target;
      if (reached()) stop();
    }, RESTORE_POLL_MS);
    const giveUp = window.setTimeout(stop, RESTORE_GIVE_UP_MS);
    for (const type of USER_INPUT_EVENTS) {
      container.addEventListener(type, stop, { passive: true });
    }
    return () => {
      window.clearInterval(poll);
      window.clearTimeout(giveUp);
      for (const type of USER_INPUT_EVENTS) container.removeEventListener(type, stop);
    };
  }, [containerRef, key]);
}
