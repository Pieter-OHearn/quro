import { describe, expect, it } from 'bun:test';
import { createLatestRequestTracker } from './useTickerLookup';

describe('createLatestRequestTracker', () => {
  it('only accepts the most recently issued request', () => {
    const tracker = createLatestRequestTracker();
    const firstRequest = tracker.issue();
    const secondRequest = tracker.issue();

    expect(tracker.isLatest(firstRequest)).toBe(false);
    expect(tracker.isLatest(secondRequest)).toBe(true);
  });
});
