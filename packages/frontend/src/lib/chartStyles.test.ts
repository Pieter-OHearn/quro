/// <reference types="bun-types" />

import { describe, expect, test } from 'bun:test';
import { CHART_TOOLTIP_PROPS, formatAxisCompact } from './chartStyles';

describe('formatAxisCompact', () => {
  test('shortens thousands and millions and keeps small values readable', () => {
    expect(formatAxisCompact(0)).toBe('0');
    expect(formatAxisCompact(250)).toBe('250');
    expect(formatAxisCompact(1500)).toBe('1.5K');
    expect(formatAxisCompact(2_000_000)).toBe('2M');
  });

  test('uses a real minus sign for negatives and nothing for non-finite values', () => {
    expect(formatAxisCompact(-2000)).toBe('−2K');
    expect(formatAxisCompact(Number.NaN)).toBe('');
  });
});

describe('chart tooltip', () => {
  test('is bounded to the viewport, wraps long labels and ignores the pointer', () => {
    expect(CHART_TOOLTIP_PROPS.contentStyle.maxWidth).toContain('100vw');
    expect(CHART_TOOLTIP_PROPS.contentStyle.overflowWrap).toBe('anywhere');
    expect(CHART_TOOLTIP_PROPS.wrapperStyle.pointerEvents).toBe('none');
  });
});
