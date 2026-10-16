import { describe, expect, test } from 'bun:test';
import { keyboardBoxFrom } from './useVisualViewport';

describe('keyboardBoxFrom', () => {
  test('reports the visible box when a keyboard covers the page', () => {
    expect(keyboardBoxFrom({ height: 420, offsetTop: 0 }, 844)).toEqual({ top: 0, height: 420 });
    expect(keyboardBoxFrom({ height: 420, offsetTop: 36 }, 844)).toEqual({ top: 36, height: 420 });
  });

  test('ignores browser chrome and layouts that already resized for the keyboard', () => {
    expect(keyboardBoxFrom({ height: 844, offsetTop: 0 }, 844)).toBeNull();
    expect(keyboardBoxFrom({ height: 780, offsetTop: 0 }, 844)).toBeNull();
  });

  test('ignores a pinch zoom', () => {
    expect(keyboardBoxFrom({ height: 420, offsetTop: 0, scale: 2 }, 844)).toBeNull();
    expect(keyboardBoxFrom({ height: 420, offsetTop: 0, scale: 1 }, 844)).toEqual({
      top: 0,
      height: 420,
    });
  });
});
