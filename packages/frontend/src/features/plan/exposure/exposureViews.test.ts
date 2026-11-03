import { describe, expect, test } from 'bun:test';
import { DEFAULT_EXPOSURE_VIEW, resolveExposureView } from './exposureViews';

describe('resolveExposureView', () => {
  test('defaults to Everything', () => {
    expect(DEFAULT_EXPOSURE_VIEW).toBe('everything');
    expect(resolveExposureView(null)).toBe('everything');
  });

  test('opens the view a link names, and the default for anything else', () => {
    expect(resolveExposureView('investments')).toBe('investments');
    expect(resolveExposureView('everything')).toBe('everything');
    expect(resolveExposureView('pensions')).toBe('everything');
  });
});
