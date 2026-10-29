import { describe, expect, test } from 'bun:test';
import { shouldResetShellScroll } from './useShellScrollReset';

const LAYOUT_HEIGHT = 844;
const FULL_VIEWPORT = { height: LAYOUT_HEIGHT, offsetTop: 0, scale: 1 };

describe('shouldResetShellScroll', () => {
  test('resets once the keyboard has closed and no field has focus', () => {
    expect(
      shouldResetShellScroll({
        viewport: FULL_VIEWPORT,
        layoutHeight: LAYOUT_HEIGHT,
        typing: false,
      }),
    ).toBe(true);
    expect(
      shouldResetShellScroll({ viewport: null, layoutHeight: LAYOUT_HEIGHT, typing: false }),
    ).toBe(true);
  });

  test('leaves the offsets alone while a keyboard is open or a field has focus', () => {
    const keyboard = { height: 420, offsetTop: 300, scale: 1 };
    expect(
      shouldResetShellScroll({ viewport: keyboard, layoutHeight: LAYOUT_HEIGHT, typing: false }),
    ).toBe(false);
    expect(
      shouldResetShellScroll({
        viewport: FULL_VIEWPORT,
        layoutHeight: LAYOUT_HEIGHT,
        typing: true,
      }),
    ).toBe(false);
  });

  test('leaves a pinch zoom alone', () => {
    const zoomed = { height: 420, offsetTop: 120, scale: 2 };
    expect(
      shouldResetShellScroll({ viewport: zoomed, layoutHeight: LAYOUT_HEIGHT, typing: false }),
    ).toBe(false);
  });
});
