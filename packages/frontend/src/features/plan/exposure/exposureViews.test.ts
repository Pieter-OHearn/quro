import { describe, expect, test } from 'bun:test';
import { DEFAULT_EXPOSURE_VIEW, resolveExposureView } from './exposureViews';

describe('resolveExposureView', () => {
  test('defaults to Overview', () => {
    expect(DEFAULT_EXPOSURE_VIEW).toBe('overview');
    expect(resolveExposureView(null)).toBe('overview');
  });

  test('opens the view a link names, and the default for anything else', () => {
    expect(resolveExposureView('brokerage')).toBe('brokerage');
    expect(resolveExposureView('overview')).toBe('overview');
    expect(resolveExposureView('pensions')).toBe('overview');
  });
});
