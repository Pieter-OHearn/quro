import { useLayoutEffect, useRef } from 'react';

/** The smallest size a figure shrinks to; below it the figure clips rather than become unreadable. */
const MIN_FONT_SIZE_PX = 13;

/**
 * Shrinks the text of an element until it fits its width, for a figure that must stay on one line
 * and whose length depends on the data (a seven-digit balance with cents on a 320px phone).
 * The element's own CSS size is the largest it takes; it grows back when the room or the text
 * allows. The element needs `white-space: nowrap` and a width that does not follow its content.
 */
export function useFitText<T extends HTMLElement>(text: string) {
  const ref = useRef<T>(null);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;

    function fit(target: T) {
      target.style.fontSize = '';
      const available = target.clientWidth;
      const needed = target.scrollWidth;
      if (available === 0 || needed <= available) return;
      const natural = Number.parseFloat(getComputedStyle(target).fontSize);
      if (!Number.isFinite(natural)) return;
      const fitted = Math.max(MIN_FONT_SIZE_PX, Math.floor((natural * available) / needed));
      target.style.fontSize = `${fitted}px`;
    }

    fit(element);
    if (typeof ResizeObserver === 'undefined') return;
    let lastWidth = element.clientWidth;
    const observer = new ResizeObserver(() => {
      if (element.clientWidth === lastWidth) return;
      lastWidth = element.clientWidth;
      fit(element);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [text]);

  return ref;
}
