import { useEffect, useState } from 'react';

export type VisualViewportBox = { top: number; height: number };

// Below this the visual viewport only differs from the layout viewport by browser chrome, not by a
// virtual keyboard, so it is ignored.
const KEYBOARD_MIN_HEIGHT = 120;

/** The box of the visual viewport when it is at least 120px shorter than the layout viewport. */
export function keyboardBoxFrom(
  viewport: Pick<VisualViewport, 'height' | 'offsetTop'>,
  layoutHeight: number,
): VisualViewportBox | null {
  if (layoutHeight - viewport.height < KEYBOARD_MIN_HEIGHT) return null;
  return { top: viewport.offsetTop, height: viewport.height };
}

/**
 * The visible area while a virtual keyboard covers part of the page, or null when none does.
 *
 * Browsers that resize the layout viewport for the keyboard (Chrome on Android with the
 * `resizes-content` viewport setting) never report a box, so a fixed overlay already fits. iOS
 * Safari keeps the layout viewport and shrinks only the visual one, so an overlay pinned to the
 * bottom edge would sit behind the keyboard; sizing it to this box keeps its sticky actions in view.
 */
export function useVisualViewport(active = true): VisualViewportBox | null {
  const [box, setBox] = useState<VisualViewportBox | null>(null);

  useEffect(() => {
    const viewport = typeof window === 'undefined' ? undefined : window.visualViewport;
    if (!active || !viewport) return undefined;
    const update = () => {
      const next = keyboardBoxFrom(viewport, window.innerHeight);
      setBox((current) =>
        current?.top === next?.top && current?.height === next?.height ? current : next,
      );
    };
    update();
    viewport.addEventListener('resize', update);
    viewport.addEventListener('scroll', update);
    return () => {
      viewport.removeEventListener('resize', update);
      viewport.removeEventListener('scroll', update);
      setBox(null);
    };
  }, [active]);

  return box;
}
