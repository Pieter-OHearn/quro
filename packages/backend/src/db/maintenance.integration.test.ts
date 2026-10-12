import { afterAll, describe, expect, test } from 'bun:test';
import { randomBytes } from 'node:crypto';
import postgres from 'postgres';
import { clearCountPlan, getDatabaseSummary, sumTableCounts } from './maintenance';

// The summary `db:restore` and `db:clear` take before they act. A dump from an earlier release is
// restored into a new, empty database before `quro migrate` runs, so a database without Quro's
// tables must read as empty rather than fail.

const serverUrl = new URL(process.env.DATABASE_URL!);
const server = postgres(serverUrl.toString(), { max: 1, onnotice: () => undefined });
const database = `quro_summary_${randomBytes(4).toString('hex')}`;

function urlFor(name: string): string {
  const url = new URL(serverUrl.toString());
  url.pathname = `/${name}`;
  return url.toString();
}

afterAll(async () => {
  await server.unsafe(`drop database if exists ${database} with (force)`);
  await server.end({ timeout: 5 });
});

describe('database summary', () => {
  test('reads a database without the application tables as empty', async () => {
    await server.unsafe(`create database ${database}`);
    const sql = postgres(urlFor(database), { max: 1, onnotice: () => undefined });
    try {
      const empty = await getDatabaseSummary(sql, clearCountPlan);
      expect(empty).toMatchObject({ demoUserId: null, nonDemoUsers: 0, totalUsers: 0 });
      expect(sumTableCounts(empty.tableCounts)).toBe(0);
      expect(Object.keys(empty.tableCounts)).toHaveLength(clearCountPlan.length);

      // Some tables only (an older schema): the ones that exist are counted.
      await sql`create table users (id serial primary key, email text not null)`;
      await sql`insert into users (email) values ('someone@example.invalid')`;
      const partial = await getDatabaseSummary(sql, clearCountPlan);
      expect(partial).toMatchObject({ nonDemoUsers: 1, totalUsers: 1 });
      expect(partial.tableCounts.users).toBe(1);
      expect(partial.tableCounts.sessions).toBe(0);
    } finally {
      await sql.end({ timeout: 5 });
    }
  });
});
