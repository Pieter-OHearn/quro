import { useEffect, type RefObject } from 'react';
import { isPinchZoomed, keyboardBoxFrom } from '@/components/ui';

// Fields that bring up a keyboard or picker; a focused checkbox, radio, slider or button does not.
const TEXT_ENTRY_SELECTOR = [
  'input:not([type="checkbox"], [type="radio"], [type="range"], [type="button"], [type="submit"], [type="reset"], [type="file"], [type="color"], [type="image"])',
  'textarea',
  'select',
  '[contenteditable]:not([contenteditable="false"])',
].join(', ');

type ShellScrollState = {
  viewport: Pick<VisualViewport, 'height' | 'offsetTop' | 'scale'> | null;
  layoutHeight: number;
  typing: boolean;
};

/**
 * Whether the window and the shell may be put back at the top: not while a virtual keyboard is
 * open or a field has focus, when iOS moves them on purpose, and not while the page is zoomed.
 */
export function shouldResetShellScroll({ viewport, layoutHeight, typing }: ShellScrollState) {
  if (typing) return false;
  if (!viewport) return true;
  if (isPinchZoomed(viewport)) return false;
  return keyboardBoxFrom(viewport, layoutHeight) === null;
}

/**
 * Keeps the window and the shell's fixed-height containers at the top.
 *
 * The app scrolls inside `main`; nothing around it scrolls. iOS Safari still scrolls the window
 * (and can scroll an `overflow: hidden` ancestor) to bring a focused field above its keyboard, and
 * in a home screen app it does not always scroll back when the keyboard closes. The header and the
 * page then stay shifted up behind an empty area until the person scrolls. Once no keyboard is
 * open and no field has focus, the offsets are put back.
 */
export function useShellScrollReset(
  rootRef: RefObject<HTMLElement | null>,
  columnRef: RefObject<HTMLElement | null>,
): void {
  useEffect(() => {
    const shells = [rootRef.current, columnRef.current].filter((element) => element !== null);
    const viewport = window.visualViewport ?? null;
    let frame = 0;
    const reset = () => {
      const state = {
        viewport,
        layoutHeight: window.innerHeight,
        typing: Boolean(document.activeElement?.matches(TEXT_ENTRY_SELECTOR)),
      };
      if (!shouldResetShellScroll(state)) return;
      if (window.scrollX !== 0 || window.scrollY !== 0) window.scrollTo(0, 0);
      for (const shell of shells) {
        if (shell.scrollTop !== 0) shell.scrollTop = 0;
      }
    };
    // Focus moves after `focusout`, so the check waits a frame to see where it went.
    const resetAfterFocusMoves = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(reset);
    };

    viewport?.addEventListener('resize', reset);
    window.addEventListener('scroll', reset, { passive: true });
    for (const shell of shells) shell.addEventListener('scroll', reset, { passive: true });
    document.addEventListener('focusout', resetAfterFocusMoves);
    return () => {
      window.cancelAnimationFrame(frame);
      viewport?.removeEventListener('resize', reset);
      window.removeEventListener('scroll', reset);
      for (const shell of shells) shell.removeEventListener('scroll', reset);
      document.removeEventListener('focusout', resetAfterFocusMoves);
    };
  }, [rootRef, columnRef]);
}
