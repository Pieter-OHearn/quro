import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';
import { createHash, randomBytes } from 'node:crypto';
import { join } from 'node:path';
import postgres from 'postgres';
import { toCents } from '@quro/shared';
import {
  DEBTS,
  EMPLOYMENTS,
  HOLDINGS,
  MORTGAGE,
  PENSION_POTS,
  PROPERTIES,
  RATE_HISTORY_FIRST_DAY,
  RATE_HISTORY_LAST_DAY,
  SAVINGS_ACCOUNTS,
  expectedDebtBalance,
  expectedMortgageBalance,
  expectedPensionBalance,
  expectedPropertyDebt,
  expectedSavingsBalance,
  rateHistoryDays,
} from './demoHousehold';
import { DEMO_PARTNER_EMAIL, DEMO_USER_EMAIL } from './maintenance';

// The household seed against databases of its own on the test server: it runs the real script in
// a child process, so the seeded rows are what `bun run db:seed-household` writes. Every database
// is created here with a random name and dropped afterwards, and holds synthetic data only.

// Each seed writes a few hundred rows through the application, and a new database is migrated.
setDefaultTimeout(120_000);

const BACKEND_ROOT = join(import.meta.dir, '../..');
const serverUrl = new URL(process.env.DATABASE_URL!);
const suffix = randomBytes(4).toString('hex');
const server = postgres(serverUrl.toString(), { max: 2, onnotice: () => undefined });
const createdDatabases: string[] = [];

function urlFor(database: string): string {
  const url = new URL(serverUrl.toString());
  url.pathname = `/${database}`;
  return url.toString();
}

type Run = { exitCode: number; out: string };

async function bun(args: string[], database: string): Promise<Run> {
  const url = urlFor(database);
  const child = Bun.spawn([process.execPath, '--no-env-file', ...args], {
    cwd: BACKEND_ROOT,
    env: {
      ...process.env,
      NODE_ENV: 'test',
      DATABASE_URL: url,
      ADMIN_DATABASE_URL: url,
      APP_DATABASE_URL: url,
    },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { exitCode, out: `${stdout}\n${stderr}` };
}

async function migratedDatabase(label: string): Promise<string> {
  const name = `quro_household_${label}_${suffix}`;
  await server.unsafe(`create database ${name}`);
  createdDatabases.push(name);
  const run = await bun(['src/cli/quro.ts', 'migrate'], name);
  expect(run.exitCode).toBe(0);
  return name;
}

const seed = (database: string, ...flags: string[]) =>
  bun(['src/db/seedDemoUser.ts', ...flags], database);

// One seeded database serves the tests that read the household; the tests that change it come
// first and put it back by seeding again, and the last one adds a user, so it runs last.
let seededDatabase: Promise<{ database: string; firstRun: Run }> | undefined;
function householdDatabase() {
  seededDatabase ??= (async () => {
    const database = await migratedDatabase('household');
    return { database, firstRun: await seed(database, '--household') };
  })();
  return seededDatabase;
}

async function withDatabase<T>(database: string, work: (sql: postgres.Sql) => Promise<T>) {
  const sql = postgres(urlFor(database), { max: 1, onnotice: () => undefined });
  try {
    return await work(sql);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

const count = (sql: postgres.Sql, table: string) =>
  sql
    .unsafe<{ count: number }[]>(`select count(*)::int as count from ${table}`)
    .then((r) => r[0]!.count);

afterAll(async () => {
  for (const database of createdDatabases) {
    await server.unsafe(`drop database if exists ${database} with (force)`);
  }
  await server.end({ timeout: 5 });
});

// ── Fingerprint ──────────────────────────────────────────────────────────────

// Ids are serial, so a reseed gets new ones. Rows are compared by content, with each id replaced
// by the row's position in its table and each reference by the position of the row it points to.
const TABLES = [
  'users',
  'currency_rate_history',
  'partner_links',
  'partner_link_members',
  'savings_accounts',
  'savings_transactions',
  'holdings',
  'holding_transactions',
  'holding_price_history',
  'properties',
  'property_transactions',
  'mortgages',
  'mortgage_transactions',
  'pension_pots',
  'pension_transactions',
  'debts',
  'debt_payments',
  'employments',
  'payslips',
  'goals',
  'budget_categories',
  'budget_transactions',
] as const;

const REFERENCES: Record<string, (typeof TABLES)[number]> = {
  user_id: 'users',
  requester_id: 'users',
  addressee_id: 'users',
  link_id: 'partner_links',
  account_id: 'savings_accounts',
  holding_id: 'holdings',
  property_id: 'properties',
  mortgage_id: 'mortgages',
  pot_id: 'pension_pots',
  debt_id: 'debts',
  employment_id: 'employments',
  category_id: 'budget_categories',
};
// Follow the clock or a random salt, and are not part of the household's data.
const NOT_DATA: Record<string, readonly string[]> = {
  users: ['id', 'password_hash', 'created_at', 'password_updated_at'],
};

type Row = Record<string, unknown>;

function fingerprint(database: string): Promise<Record<string, string>> {
  return withDatabase(database, async (sql) => {
    const rows = new Map<string, Row[]>();
    for (const table of TABLES) {
      rows.set(table, await sql.unsafe<Row[]>(`select * from ${table} order by 1, 2`));
    }
    const position = new Map<string, Map<unknown, number>>();
    for (const [table, list] of rows) {
      position.set(table, new Map(list.map((row, index) => [row.id ?? row.user_id, index])));
    }
    const result: Record<string, string> = {};
    for (const [table, list] of rows) {
      const normalised = list.map((row, index) => {
        const entries = Object.entries(row)
          .filter(([key]) => !NOT_DATA[table]?.includes(key))
          .map(([key, value]) => {
            if (key === 'id') return [key, index];
            if (key in REFERENCES && value !== null) {
              return [key, position.get(REFERENCES[key]!)?.get(value)];
            }
            if (table === 'goals' && key === 'source_id' && value !== null) {
              return [key, position.get('savings_accounts')?.get(value)];
            }
            return [key, value];
          });
        return Object.fromEntries(entries);
      });
      result[table] = createHash('sha256').update(JSON.stringify(normalised)).digest('hex');
    }
    return result;
  });
}

// ── Refusal ──────────────────────────────────────────────────────────────────

describe('the household seed on a database with someone else in it', () => {
  let database: string;

  beforeAll(async () => {
    database = await migratedDatabase('refuse');
    await withDatabase(
      database,
      (sql) =>
        sql`insert into users (first_name, last_name, email, password_hash)
          values ('Someone', 'Else', 'someone@example.invalid', 'not-a-real-hash')`,
    );
  });

  test('refuses with a message and writes nothing', async () => {
    const run = await seed(database, '--household');
    expect(run.exitCode).not.toBe(0);
    expect(run.out).toContain('Refusing to seed the demo household');
    expect(run.out).toContain('Nothing was changed');
    // It names neither the other account nor any credential.
    expect(run.out).not.toContain('someone@example.invalid');
    await withDatabase(database, async (sql) => {
      const emails = await sql<{ email: string }[]>`select email from users order by id`;
      expect(emails.map((row) => row.email)).toEqual(['someone@example.invalid']);
      for (const table of [
        'savings_accounts',
        'budget_transactions',
        'partner_links',
        'sessions',
      ]) {
        expect(await count(sql, table)).toBe(0);
      }
      expect(await count(sql, 'currency_rates')).toBe(0);
      expect(await count(sql, 'currency_rate_history')).toBe(0);
    });
  });

  test('leaves that user alone when the plain seed runs, which still works', async () => {
    const run = await seed(database);
    expect(run.exitCode).toBe(0);
    await withDatabase(database, async (sql) => {
      expect(await count(sql, 'users')).toBe(2);
      expect(await count(sql, 'savings_accounts')).toBe(0);
      expect(await count(sql, 'partner_links')).toBe(0);
      // The plain seed writes rates, never a history of them.
      expect(await count(sql, 'currency_rate_history')).toBe(0);
    });
  });

  test('refuses an unknown flag instead of seeding less', async () => {
    const run = await seed(database, '--houshold');
    expect(run.exitCode).not.toBe(0);
    expect(run.out).toContain('Unknown argument "--houshold"');
  });
});

// ── The seeded household ─────────────────────────────────────────────────────

describe('the seeded household', () => {
  let database: string;
  let firstRun: Run;
  let firstFingerprint: Record<string, string>;
  let firstCounts: Record<string, number>;

  const tableCounts = (name: string) =>
    withDatabase(name, async (sql) =>
      Object.fromEntries(
        await Promise.all(TABLES.map(async (table) => [table, await count(sql, table)] as const)),
      ),
    );

  beforeAll(async () => {
    ({ database, firstRun } = await householdDatabase());
    firstFingerprint = await fingerprint(database);
    firstCounts = await tableCounts(database);
  });

  test('seeds both demo users as accepted partners and prints no secret', async () => {
    expect(firstRun.exitCode).toBe(0);
    expect(firstRun.out).toContain('are linked partners');
    expect(firstRun.out).not.toMatch(/password|postgres:\/\//i);
    await withDatabase(database, async (sql) => {
      const emails = await sql<{ email: string }[]>`select email from users order by id`;
      expect(emails.map((row) => row.email)).toEqual([DEMO_USER_EMAIL, DEMO_PARTNER_EMAIL]);
      const links = await sql<{ status: string; members: number }[]>`
        select l.status, (select count(*)::int from partner_link_members m where m.link_id = l.id) as members
        from partner_links l`;
      expect([...links]).toEqual([{ status: 'accepted', members: 2 }]);
      // No session of the seed outlives it.
      expect(await count(sql, 'sessions')).toBe(0);
    });
  });

  test('runs twice to the same rows', async () => {
    const second = await seed(database, '--household');
    expect(second.exitCode).toBe(0);
    expect(await tableCounts(database)).toEqual(firstCounts);
    expect(await fingerprint(database)).toEqual(firstFingerprint);
    await withDatabase(database, async (sql) => {
      expect(await count(sql, 'users')).toBe(2);
      expect(await count(sql, 'currency_rates')).toBe(7);
    });
  });

  test('repairs a household that someone edited', async () => {
    await withDatabase(database, async (sql) => {
      await sql`update savings_accounts set balance = 1, is_joint = false where name = 'Joint Household'`;
      await sql`delete from goals`;
      await sql`delete from currency_rate_history where source_date = '2025-03-01'`;
      await sql`insert into currency_rate_history (from_currency, to_currency, rate, provider, source_date)
        values ('GBP', 'EUR', 1.2, 'provider-fixture', '2024-12-01')`;
      await sql`insert into goals (user_id, name, current_amount, target_amount, deadline, category,
        monthly_contribution) select id, 'Stray', 1, 2, 'Dec 2030', 'x', 0 from users limit 1`;
    });
    expect((await seed(database, '--household')).exitCode).toBe(0);
    // Everything but the provider's row is back; that row is not the seed's to remove.
    await withDatabase(database, async (sql) => {
      const [kept] = await sql<{ n: number }[]>`
        select count(*)::int as n from currency_rate_history where provider = 'provider-fixture'`;
      expect(kept!.n).toBe(1);
      await sql`delete from currency_rate_history where provider = 'provider-fixture'`;
    });
    expect(await fingerprint(database)).toEqual(firstFingerprint);
  });

  test('has private and joint rows, several currencies, a loss and negative equity', async () => {
    await withDatabase(database, async (sql) => {
      const joint = await sql<{ owner: string; joint: boolean; n: number }[]>`
        select u.email as owner, s.is_joint as joint, count(*)::int as n
        from savings_accounts s join users u on u.id = s.user_id group by 1, 2 order by 1, 2`;
      expect(joint.map((row) => `${row.owner}:${row.joint}`).sort()).toEqual(
        [
          `${DEMO_USER_EMAIL}:false`,
          `${DEMO_USER_EMAIL}:true`,
          `${DEMO_PARTNER_EMAIL}:false`,
          `${DEMO_PARTNER_EMAIL}:true`,
        ].sort(),
      );
      const currencies = await sql<{ currency: string }[]>`
        select distinct currency::text as currency from (
          select currency from savings_accounts union all select currency from holdings
          union all select currency from properties union all select currency from pension_pots
          union all select currency from debts union all select currency from payslips
        ) all_currencies order by 1`;
      expect(currencies.map((row) => row.currency)).toEqual(['CHF', 'EUR', 'GBP', 'USD']);
      const [equity] = await sql<{ equity: string }[]>`
        select (p.current_value - p.mortgage)::text as equity from properties p
        where p.mortgage_id is null`;
      expect(Number(equity!.equity)).toBeLessThan(0);
      const [loss] = await sql<{ cost: string; value: string }[]>`
        select (sum(case when t.type = 'buy' then t.shares * t.price end)
               / sum(case when t.type = 'buy' then t.shares end))::text as cost,
               min(h.current_price)::text as value
        from holdings h join holding_transactions t on t.holding_id = h.id
        where h.ticker = 'FRGP'`;
      expect(Number(loss!.value)).toBeLessThan(Number(loss!.cost));
      const nonAscii = await sql<{ n: number }[]>`
        select count(*)::int as n from savings_accounts where name ~ '[^\\x01-\\x7F]'`;
      expect(nonAscii[0]!.n).toBeGreaterThan(0);
    });
  });

  test('stores a monthly rate history of its own for every currency, and confirms every bank', async () => {
    await withDatabase(database, async (sql) => {
      const perCurrency = await sql<{ currency: string; n: number; first: string; last: string }[]>`
        select from_currency::text as currency, count(*)::int as n,
               min(source_date)::text as first, max(source_date)::text as last
        from currency_rate_history where provider = 'seed' group by 1 order by 1`;
      expect(perCurrency.map((row) => row.currency)).toEqual([
        'AUD',
        'CAD',
        'CHF',
        'GBP',
        'NZD',
        'SGD',
        'USD',
      ]);
      for (const row of perCurrency) {
        expect(row.n).toBe(rateHistoryDays().length);
        expect([row.first, row.last]).toEqual([RATE_HISTORY_FIRST_DAY, RATE_HISTORY_LAST_DAY]);
      }
      const [others] = await sql<{ n: number }[]>`
        select count(*)::int as n from currency_rate_history where provider <> 'seed'`;
      expect(others!.n).toBe(0);
      const [unconfirmed] = await sql<{ n: number }[]>`
        select count(*)::int as n from savings_accounts
        where banking_entity_confirmed_at is null or banking_entity_id is null
          or deposit_guarantee_cap is null`;
      expect(unconfirmed!.n).toBe(0);
    });
  });

  test('has no document, import or provider row', async () => {
    await withDatabase(database, async (sql) => {
      const [documents] = await sql<{ n: number }[]>`
        select ((select count(*) from payslips where document_storage_key is not null)
              + (select count(*) from pension_transactions where document_storage_key is not null))::int as n`;
      expect(documents!.n).toBe(0);
      for (const table of ['pension_statement_imports', 'bunq_connections', 'auth_codes']) {
        expect(await count(sql, table)).toBe(0);
      }
      const [provider] = await sql<{ n: number }[]>`
        select count(*)::int as n from savings_accounts where bunq_account_id is not null`;
      expect(provider!.n).toBe(0);
      // Fictional tickers never reach a price provider.
      const [synced] = await sql<{ n: number }[]>`
        select count(*)::int as n from holdings where exclude_from_sync = false`;
      expect(synced!.n).toBe(0);
    });
  });

  test('keeps every balance equal to its opening balance plus its ledger', async () => {
    await withDatabase(database, async (sql) => {
      const balance = (value: unknown) => Number(value);
      for (const account of SAVINGS_ACCOUNTS) {
        const [row] = await sql<{ balance: string; effect: string }[]>`
          select a.balance::text as balance,
                 coalesce(sum(case t.type when 'withdrawal' then -t.amount else t.amount end), 0)::text as effect
          from savings_accounts a left join savings_transactions t on t.account_id = a.id
          where a.name = ${account.name} group by a.id`;
        expect(balance(row!.balance)).toBe(expectedSavingsBalance(account));
        expect(balance(row!.balance) - balance(row!.effect)).toBeCloseTo(account.openingBalance, 2);
      }
      for (const pot of PENSION_POTS) {
        const [row] = await sql<{ balance: string; effect: string }[]>`
          select p.balance::text as balance,
                 coalesce(sum(case t.type when 'contribution' then t.amount - t.tax_amount
                   when 'fee' then -t.amount else t.amount end), 0)::text as effect
          from pension_pots p left join pension_transactions t on t.pot_id = p.id
          where p.name = ${pot.name} group by p.id`;
        expect(balance(row!.balance)).toBe(expectedPensionBalance(pot));
        expect(balance(row!.balance) - balance(row!.effect)).toBeCloseTo(pot.openingBalance, 2);
      }
      for (const debt of DEBTS) {
        const [row] = await sql<{ balance: string; principal: string }[]>`
          select d.remaining_balance::text as balance, coalesce(sum(p.principal), 0)::text as principal
          from debts d left join debt_payments p on p.debt_id = d.id
          where d.name = ${debt.name} group by d.id`;
        expect(balance(row!.balance)).toBe(expectedDebtBalance(debt));
        expect(balance(row!.balance) + balance(row!.principal)).toBeCloseTo(debt.openingBalance, 2);
      }
      const [mortgage] = await sql<{ balance: string; principal: string; split: number }[]>`
        select m.outstanding_balance::text as balance, sum(t.principal)::text as principal,
               count(*) filter (where t.amount <> t.interest + t.principal)::int as split
        from mortgages m join mortgage_transactions t on t.mortgage_id = m.id
        where t.type = 'repayment' group by m.id`;
      expect(balance(mortgage!.balance)).toBe(expectedMortgageBalance(MORTGAGE));
      expect(balance(mortgage!.balance) + balance(mortgage!.principal)).toBeCloseTo(
        MORTGAGE.openingBalance,
        2,
      );
      expect(mortgage!.split).toBe(0);
      const flat = PROPERTIES.find((property) => property.key === 'flat')!;
      const [property] = await sql<{ mortgage: string; principal: string }[]>`
        select p.mortgage::text as mortgage, sum(t.principal)::text as principal
        from properties p join property_transactions t on t.property_id = p.id
        where t.type = 'repayment' group by p.id`;
      expect(balance(property!.mortgage)).toBe(expectedPropertyDebt(flat));
      expect(balance(property!.mortgage) + balance(property!.principal)).toBeCloseTo(
        flat.manualMortgage,
        2,
      );
      // A linked mortgage replaces the property's own debt.
      const [linked] = await sql<{ mortgage: string; linked: boolean }[]>`
        select mortgage::text, mortgage_id is not null as linked from properties
        where address like '12 Voorbeeldstraat%'`;
      expect(linked).toEqual({ mortgage: '0.00', linked: true });
    });
  });

  test('keeps every budget category equal to its transactions, in euros with the source kept', async () => {
    await withDatabase(database, async (sql) => {
      const mismatches = await sql<{ name: string }[]>`
        select c.name from budget_categories c
        left join budget_transactions t on t.category_id = c.id
        group by c.id having c.spent <> coalesce(sum(t.amount), 0)`;
      expect([...mismatches]).toEqual([]);
      const foreign = await sql<
        { amount: string; source_amount: string; source_currency: string }[]
      >`
        select amount::text, source_amount::text, source_currency::text
        from budget_transactions where source_currency <> 'EUR'`;
      expect(foreign.length).toBeGreaterThan(0);
      for (const row of foreign) {
        expect(Number(row.amount)).toBeCloseTo(Number(row.source_amount) * 1.18, 2);
      }
      const [notEuro] = await sql<{ n: number }[]>`
        select count(*)::int as n from budget_transactions where currency <> 'EUR'`;
      expect(notEuro!.n).toBe(0);
    });
  });

  test('records shares as buys minus sells and a price history that ends at the current price', async () => {
    await withDatabase(database, async (sql) => {
      for (const holding of HOLDINGS) {
        const [row] = await sql<{ shares: string; price: string; last: string; points: number }[]>`
          select coalesce(sum(case t.type when 'buy' then t.shares when 'sell' then -t.shares end), 0)::text as shares,
                 h.current_price::text as price,
                 (select close_price::text from holding_price_history
                   where holding_id = h.id order by eod_date desc limit 1) as last,
                 (select count(*)::int from holding_price_history where holding_id = h.id) as points
          from holdings h left join holding_transactions t on t.holding_id = h.id
          where h.ticker = ${holding.ticker} group by h.id`;
        expect(row!.last).toBe(row!.price);
        expect(row!.points).toBe(holding.priceHistory.length);
        expect(Number(row!.shares)).toBeGreaterThan(0);
      }
    });
  });

  test('has payslips for each employment and no document', async () => {
    await withDatabase(database, async (sql) => {
      for (const employment of EMPLOYMENTS) {
        const [row] = await sql<{ n: number }[]>`
          select count(*)::int as n from payslips p join employments e on e.id = p.employment_id
          where e.employer_name = ${employment.employerName}`;
        expect(row!.n).toBe(employment.payslips.length);
      }
    });
  });
});

// ── Through the application ──────────────────────────────────────────────────

type Allocations = {
  allocations: { key: string; value: number }[];
  netWorth: number;
  totalAssets: number;
  liabilitiesTotal: number;
};

type Probe = Record<'demo' | 'partner', Record<string, unknown>>;

describe('the seeded household through the application', () => {
  let database: string;
  let probe: Probe;

  beforeAll(async () => {
    ({ database } = await householdDatabase());
    const run = await bun(['src/test/householdProbe.ts'], database);
    expect(run.exitCode).toBe(0);
    probe = JSON.parse(run.out.slice(run.out.indexOf('{'))) as Probe;
  });

  const allocationsOf = (member: 'demo' | 'partner') =>
    probe[member]['/api/dashboard/allocations'] as Allocations;

  const component = (summary: Allocations, key: string) =>
    summary.allocations.find((row) => row.key === key)!.value;

  // The same aggregate from the stored rows: joint rows count half, and each row is rounded to
  // cents once (PostgreSQL rounds half away from zero), as the shared money totals do.
  function databaseTotals(userId: number, partnerId: number) {
    return withDatabase(database, async (sql) => {
      const rates = `(select from_currency::text as currency, rate from currency_rates
        where to_currency = 'EUR' union all select 'EUR', 1)`;
      const visible = (alias: string) =>
        `(${alias}.user_id = $1 or (${alias}.user_id = $2 and ${alias}.is_joint)) and ${alias}.archived_at is null`;
      const share = (alias: string) => `(case when ${alias}.is_joint then 0.5 else 1 end)`;
      const [row] = await sql.unsafe<Record<string, string>[]>(
        `select
          (select coalesce(sum(round(s.balance * ${share('s')} * r.rate, 2)), 0) from savings_accounts s
            join ${rates} r on r.currency = s.currency::text where ${visible('s')})::text as savings,
          (select coalesce(sum(round(round(greatest(0, coalesce(t.net, 0)) * h.current_price, 2) * r.rate, 2)), 0)
            from holdings h join ${rates} r on r.currency = h.currency::text
            left join (select holding_id, sum(case type when 'buy' then shares when 'sell' then -shares
              else 0 end) as net from holding_transactions group by holding_id) t on t.holding_id = h.id
            where h.user_id = $1 and h.archived_at is null)::text as brokerage,
          (select coalesce(sum(round((p.current_value * ${share('p')} - case when p.mortgage_id is null
              then p.mortgage * ${share('p')} else coalesce(m.outstanding_balance * ${share('m')}, 0)
              end) * r.rate, 2)), 0)
            from properties p join ${rates} r on r.currency = p.currency::text
            left join mortgages m on m.id = p.mortgage_id and m.archived_at is null
            where ${visible('p')})::text as property_equity,
          (select coalesce(sum(round(pp.balance * r.rate, 2)), 0) from pension_pots pp
            join ${rates} r on r.currency = pp.currency::text
            where pp.user_id = $1 and pp.archived_at is null)::text as pension,
          (select coalesce(sum(round(d.remaining_balance * r.rate, 2)), 0) from debts d
            join ${rates} r on r.currency = d.currency::text
            where d.user_id = $1 and d.archived_at is null)::text as liabilities`,
        [userId, partnerId],
      );
      return Object.fromEntries(Object.entries(row!).map(([k, v]) => [k, Number(v)]));
    });
  }

  const userIds = () =>
    withDatabase(database, async (sql) => {
      const rows = await sql<{ id: number; email: string }[]>`select id, email from users`;
      const idOf = (email: string) => rows.find((row) => row.email === email)!.id;
      return { demo: idOf(DEMO_USER_EMAIL), partner: idOf(DEMO_PARTNER_EMAIL) };
    });

  test('answers the dashboard and the runway for both partners', () => {
    for (const member of ['demo', 'partner'] as const) {
      const summary = probe[member]['/api/dashboard/summary'] as {
        netWorth: unknown[];
        allocations: Allocations;
      };
      expect(summary.netWorth.length).toBeGreaterThan(0);
      expect(summary.allocations.netWorth).toBeGreaterThan(0);
      const runway = probe[member]['/api/plan/runway'] as { baseCurrency: string; burn: object };
      expect(runway.baseCurrency).toBe('EUR');
      expect(runway.burn).toBeDefined();
    }
  });

  test('shows a net worth history none of whose points is estimated', () => {
    for (const member of ['demo', 'partner'] as const) {
      const summary = probe[member]['/api/dashboard/summary'] as {
        netWorth: { isEstimated: boolean }[];
      };
      expect(summary.netWorth.length).toBeGreaterThan(6);
      expect(summary.netWorth.filter((point) => point.isEstimated)).toEqual([]);
      const history = probe[member]['/api/dashboard/net-worth'] as { isEstimated: boolean }[];
      expect(history.filter((point) => point.isEstimated)).toEqual([]);
    }
  });

  test('reports no bank awaiting entity review', () => {
    for (const member of ['demo', 'partner'] as const) {
      const runway = probe[member]['/api/plan/runway'] as {
        depositGuarantee: { confidence: string; accountIds: number[]; cap: number | null }[];
      };
      expect(runway.depositGuarantee.length).toBeGreaterThan(0);
      expect(runway.depositGuarantee.filter((entry) => entry.confidence !== 'verified')).toEqual(
        [],
      );
      for (const entry of runway.depositGuarantee) expect(entry.cap).toBeGreaterThan(0);
    }
  });

  test('matches the totals worked out from the stored rows, joint rows at 50%', async () => {
    const ids = await userIds();
    for (const [member, partner] of [
      ['demo', 'partner'],
      ['partner', 'demo'],
    ] as const) {
      const expected = await databaseTotals(ids[member], ids[partner]);
      const summary = allocationsOf(member);
      const close = (actual: number, wanted: number) =>
        expect(toCents(actual)).toBe(toCents(wanted));
      close(component(summary, 'savings'), expected.savings!);
      close(component(summary, 'brokerage'), expected.brokerage!);
      close(component(summary, 'property_equity'), expected.property_equity!);
      close(component(summary, 'pension'), expected.pension!);
      close(summary.liabilitiesTotal, expected.liabilities!);
      close(
        summary.netWorth,
        expected.savings! +
          expected.brokerage! +
          expected.property_equity! +
          expected.pension! -
          expected.liabilities!,
      );
    }
  });

  test('splits the joint home evenly and keeps private rows private', () => {
    const home = (
      probe.demo['/api/investments/properties'] as { address: string; currentValue: number }[]
    ).find((property) => property.address.startsWith('12 Voorbeeldstraat'))!;
    const mortgage = (probe.demo['/api/mortgages'] as { outstandingBalance: number }[])[0]!;
    const homeEquity = home.currentValue - mortgage.outstandingBalance;
    // The partner holds no property of their own, so their equity is their half of the home.
    expect(toCents(component(allocationsOf('partner'), 'property_equity'))).toBe(
      toCents(homeEquity / 2),
    );
    // The flat is the demo user's alone: their equity is half the home plus all of the flat.
    const demoAccounts = probe.demo['/api/savings/accounts'] as { name: string }[];
    const partnerAccounts = probe.partner['/api/savings/accounts'] as { name: string }[];
    expect(demoAccounts.map((a) => a.name)).toContain('Joint Household');
    expect(demoAccounts.map((a) => a.name)).toContain('Ferienfonds Zürich');
    expect(partnerAccounts.map((a) => a.name)).toContain('Joint Household');
    expect(partnerAccounts.map((a) => a.name)).not.toContain('Everyday Account');
    expect(demoAccounts.map((a) => a.name)).not.toContain('Dollar Savings');
    const debts = (probe.demo['/api/debts'] as { name: string }[]).map((debt) => debt.name);
    expect(debts).toEqual(['Example Car Loan']);
  });
});

// ── A user who arrives later ─────────────────────────────────────────────────

describe('the household seed after a real account appears', () => {
  test('refuses and leaves the household exactly as it was', async () => {
    const { database: own } = await householdDatabase();
    const before = await fingerprint(own);
    await withDatabase(
      own,
      (sql) =>
        sql`insert into users (first_name, last_name, email, password_hash)
          values ('Someone', 'Else', 'late@example.invalid', 'not-a-real-hash')`,
    );
    const run = await seed(own, '--household');
    expect(run.exitCode).not.toBe(0);
    expect(run.out).toContain('Refusing to seed the demo household');
    const after = await fingerprint(own);
    // The users table gained a row; every other table is exactly as it was.
    const { users: _before, ...beforeRest } = before;
    const { users: _after, ...afterRest } = after;
    expect(afterRest).toEqual(beforeRest);
    expect(_after).not.toEqual(_before);
  });
});
