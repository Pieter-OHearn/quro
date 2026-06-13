import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

const routeSource = readFileSync(new URL('./savings.ts', import.meta.url), 'utf8');
const balanceSource = readFileSync(new URL('../lib/savingsBalance.ts', import.meta.url), 'utf8');

describe('savings transaction mutation safety', () => {
  test('transaction mutations keep row and balance updates in one database transaction', () => {
    expect(routeSource).toContain('const [data] = await db.transaction(async (tx) => {');
    expect(routeSource).toContain('await syncSavingsBalancesForEditedTransaction(tx, {');
    expect(routeSource).toMatch(
      /await updateSavingsAccountBalanceByDelta\(\s*tx,\s*deleted\.accountId/,
    );
  });

  test('balance helper accepts the caller database client instead of escaping transactions', () => {
    expect(balanceSource).toContain("type SavingsBalanceDb = Pick<typeof db, 'update'>;");
    expect(balanceSource).toContain('client: SavingsBalanceDb');
    expect(balanceSource).toContain('await client');
  });
});
