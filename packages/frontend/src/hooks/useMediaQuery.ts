import { useCallback, useSyncExternalStore } from 'react';

/** Below 640px: the phone layout of the V1 design (Tailwind's `max-sm:`). */
export const PHONE_MEDIA_QUERY = '(max-width: 639.98px)';

/**
 * Whether a CSS media query matches, following changes live. Without `window.matchMedia`
 * (server rendering, tests) it reports `false`, the laptop layout.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (typeof window === 'undefined' || !window.matchMedia) return () => undefined;
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    [query],
  );
  const getSnapshot = () =>
    typeof window !== 'undefined' && Boolean(window.matchMedia?.(query).matches);
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}

/** The operating system's reduced-motion preference, following changes live. */
export const REDUCED_MOTION_MEDIA_QUERY = '(prefers-reduced-motion: reduce)';

/**
 * Props for animated chart series, tooltips and slices: no animation with reduced motion.
 * Spread them on every Recharts `Area`, `Bar`, `Pie` and `Tooltip`.
 */
export function useChartMotion(): { isAnimationActive: boolean } {
  return { isAnimationActive: !useMediaQuery(REDUCED_MOTION_MEDIA_QUERY) };
}
