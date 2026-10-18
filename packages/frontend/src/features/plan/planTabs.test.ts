import { describe, expect, test } from 'bun:test';
import { DEFAULT_PLAN_TAB, PLAN_TABS, resolvePlanTab } from './planTabs';

describe('plan tabs', () => {
  test('open the tab the URL names and fall back to the first for anything else', () => {
    expect(resolvePlanTab('exposure')).toBe('exposure');
    expect(resolvePlanTab('runway')).toBe('runway');
    expect(resolvePlanTab(null)).toBe(DEFAULT_PLAN_TAB);
    expect(resolvePlanTab('year-ahead')).toBe(DEFAULT_PLAN_TAB);
    expect(resolvePlanTab('')).toBe(DEFAULT_PLAN_TAB);
  });

  test('list each tab once, runway first', () => {
    const values = PLAN_TABS.map((tab) => tab.value);
    expect(new Set(values).size).toBe(values.length);
    expect(values[0]).toBe('runway');
    expect(values).toContain('exposure');
  });
});
