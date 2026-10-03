/// <reference types="bun-types" />
import { expect, test } from 'bun:test';
import { useState } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { usePagination } from './usePagination';

type Scenario = { count: number; key: string; select?: number };
function paginate(scenarios: readonly Scenario[]) {
  const snapshots: { page: number; items: number[]; start: number; end: number; pages: number }[] =
    [];
  function Probe() {
    const [stage, setStage] = useState(0);
    const scenario = scenarios[stage];
    const result = usePagination(
      Array.from({ length: scenario.count }, (_, index) => index),
      6,
      scenario.key,
    );
    snapshots.push({
      page: result.safeCurrentPage,
      items: result.pageItems,
      start: result.rangeStart,
      end: result.rangeEnd,
      pages: result.totalPages,
    });
    if (stage < scenarios.length - 1) {
      if (scenario.select !== undefined) result.handlePageChange(scenario.select);
      setStage(stage + 1);
    }
    return null;
  }
  renderToStaticMarkup(<Probe />);
  return snapshots;
}

test('clamps after deletion and keeps the clamped page when the list grows again', () => {
  const snapshots = paginate([
    { count: 18, key: 'account-1', select: 3 },
    { count: 18, key: 'account-1' },
    { count: 7, key: 'account-1' },
    { count: 18, key: 'account-1' },
  ]);
  expect(snapshots.map((snapshot) => snapshot.page)).toEqual([1, 3, 2, 2]);
  expect(snapshots[2]).toEqual({ page: 2, items: [6], start: 7, end: 7, pages: 2 });
});
test('a changed account, filter or sort resets before rows render', () => {
  const snapshots = paginate([
    { count: 18, key: 'account-1:all', select: 3 },
    { count: 18, key: 'account-2:all' },
    { count: 18, key: 'account-1:all' },
  ]);
  expect(snapshots.length).toBeGreaterThanOrEqual(3);
  expect(snapshots.every((snapshot) => snapshot.page === 1)).toBe(true);
});
test('empty data has zero ranges and out-of-bounds requests clamp both ends', () => {
  const snapshots = paginate([
    { count: 0, key: 'all', select: 99 },
    { count: 13, key: 'all', select: 99 },
    { count: 13, key: 'all', select: -2 },
    { count: 13, key: 'all' },
  ]);
  expect(snapshots[0]).toEqual({ page: 1, items: [], start: 0, end: 0, pages: 1 });
  expect(snapshots[2].page).toBe(3);
  expect(snapshots[3].page).toBe(1);
});
