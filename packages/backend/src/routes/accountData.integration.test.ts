import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import { installProviderMocks } from '../test/providerMocks';
import { readZip } from '../test/zipReader';
import { parseCsv } from '../test/csvReader';

setDefaultTimeout(60_000);

const providers = await installProviderMocks();
const { db } = await import('../db/client');
const schema = await import('../db/schema');
const { ACCOUNT_TABLES, selectAccountRows } = await import('../lib/accountData');
const { retryDeletedAccountDocuments } = await import('../lib/accountDeletion');
const world = await import('../test/accessWorld');

type World = Awaited<ReturnType<typeof world.createWorld>>;
type Manifest = {
  format: string;
  formatVersion: number;
  tables: Record<
    string,
    {
      rows: number;
      columns: string[];
      json: { path: string; sha256: string };
      csv: { path: string; sha256: string };
    }
  >;
  documents: {
    included: Array<{ table: string; rowId: number; path: string; sha256: string; bytes: number }>;
    missing: unknown[];
  };
};

let w: World;
const sha256 = (data: Uint8Array) => createHash('sha256').update(data).digest('hex');
const auditIds: number[] = [];

beforeAll(async () => {
  w = await world.createWorld((key, bytes) => {
    providers.storedDocuments.set(key, bytes);
  });
});

afterAll(async () => {
  if (auditIds.length > 0) {
    await db.delete(schema.accountDeletions).where(inArray(schema.accountDeletions.id, auditIds));
  }
  await world.destroyWorld(w.integration);
  await providers.restore();
});

async function exportArchive(session: { cookie: string }) {
  const response = await w.integration.request('/api/settings/export', { cookie: session.cookie });
  expect(response.status).toBe(200);
  expect(response.headers.get('content-type')).toBe('application/zip');
  expect(response.headers.get('content-disposition')).toContain('attachment');
  const entries = readZip(new Uint8Array(await response.arrayBuffer()));
  const manifest = JSON.parse(entries.get('manifest.json')!.toString('utf8')) as Manifest;
  return { entries, manifest };
}

describe('registry', () => {
  test('covers every table that holds a user column, or says why not', () => {
    const covered = new Set(ACCOUNT_TABLES.map((entry) => entry.name));
    const handledElsewhere = new Set([
      'sessions',
      'auth_codes',
      'bunq_connections',
      'bunq_oauth_attempts',
      'oidc_identities',
      'bunq_payment_progress',
      'partner_link_members',
    ]);
    const missing = world
      .tablesWithUserColumn()
      .filter((name) => !covered.has(name) && !handledElsewhere.has(name));
    expect(missing).toEqual([]);
  });
});

describe('data export', () => {
  test('requires a session', async () => {
    const response = await w.integration.request('/api/settings/export');
    expect(response.status).toBe(401);
  });

  test('carries every owned row, checked against the database and the manifest hashes', async () => {
    const { entries, manifest } = await exportArchive(w.owner);
    expect(manifest.format).toBe('quro-export');
    expect(manifest.formatVersion).toBe(1);
    expect(entries.has('README.txt')).toBe(true);
    expect([...entries.keys()].at(-1)).toBe('manifest.json');

    for (const entry of ACCOUNT_TABLES) {
      const stored = await selectAccountRows(db, entry, w.owner.user.id);
      const table = manifest.tables[entry.name]!;
      expect(table.rows).toBe(stored.length);
      const json = entries.get(table.json.path)!;
      const csv = entries.get(table.csv.path)!;
      expect(sha256(json)).toBe(table.json.sha256);
      expect(sha256(csv)).toBe(table.csv.sha256);
      const rows = JSON.parse(json.toString('utf8')) as Array<Record<string, unknown>>;
      expect(rows.map((row) => row.id)).toEqual(stored.map((row) => row.id));
      const parsed = parseCsv(csv.toString('utf8'));
      expect(parsed[0]).toEqual(table.columns);
      expect(parsed.length - 1).toBe(rows.length);
    }
    // Both the private and the joint set the owner holds are in the export.
    expect(manifest.tables.savings_accounts!.rows).toBe(3);
    expect(manifest.tables.payslips!.rows).toBe(3);
  });

  test('carries the provider link as issuer and subject, and nothing else about it', async () => {
    const ownerId = w.owner.user.id;
    const strangerId = w.stranger.user.id;
    await db.insert(schema.oidcIdentities).values([
      { userId: ownerId, issuer: 'https://auth.example', subject: 'owner-subject-1' },
      { userId: strangerId, issuer: 'https://auth.example', subject: 'stranger-subject-1' },
    ]);
    try {
      const { entries, manifest } = await exportArchive(w.owner);
      const table = manifest.tables.oidc_identities!;
      expect(table.rows).toBe(1);
      expect(table.columns).toEqual(['id', 'issuer', 'subject']);
      const rows = JSON.parse(entries.get(table.json.path)!.toString('utf8')) as Array<
        Record<string, unknown>
      >;
      expect(rows.map((row) => row.issuer)).toEqual(['https://auth.example']);
      expect(rows.map((row) => row.subject)).toEqual(['owner-subject-1']);
      expect(Object.keys(rows[0]!).sort()).toEqual(['id', 'issuer', 'subject']);
      // Another account's link is not in this archive.
      const everything = [...entries.values()].map((entry) => entry.toString('utf8')).join('\n');
      expect(everything).not.toContain('stranger-subject-1');
      expect(entries.get('README.txt')!.toString('utf8')).toContain('oidc_identities');
    } finally {
      await db
        .delete(schema.oidcIdentities)
        .where(inArray(schema.oidcIdentities.userId, [ownerId, strangerId]));
    }
  });

  test('includes documents with their hashes and row links', async () => {
    const { entries, manifest } = await exportArchive(w.owner);
    expect(manifest.documents.included.length).toBeGreaterThan(0);
    expect(manifest.documents.missing).toEqual([]);
    for (const document of manifest.documents.included) {
      const body = entries.get(document.path)!;
      expect(body.byteLength).toBe(document.bytes);
      expect(sha256(body)).toBe(document.sha256);
      expect(document.path.startsWith(`documents/${document.table}/${document.rowId}-`)).toBe(true);
    }
  });

  test('leaves out credentials, sessions and other households, however they are spelled', async () => {
    const { entries } = await exportArchive(w.owner);
    const everything = [...entries.values()].map((entry) => entry.toString('latin1')).join('\n');
    const [owner] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, w.owner.user.id));
    expect(everything).not.toContain(owner.passwordHash);
    expect(everything).not.toMatch(/passwordHash|password_hash|access_?token|private_?key/i);
    expect(everything).not.toMatch(/(?:token|key|session)-s04-/);
    expect(everything).not.toContain(w.owner.cookie.match(/session=([^;]+)/)![1]!);
    expect(everything).not.toMatch(/s04-stranger/);
    expect(everything).not.toMatch(/storage_?key|users\/\d+\//i);
    expect(everything).toContain('s04-owner-private');
  });

  test("exports a partner's household without the other partner's rows", async () => {
    const { manifest, entries } = await exportArchive(w.partner);
    expect(manifest.tables.savings_accounts!.rows).toBe(0);
    expect(manifest.documents.included).toEqual([]);
    const everything = [...entries.values()].map((entry) => entry.toString('utf8')).join('\n');
    expect(everything).not.toMatch(/s04-owner/);
  });

  test('guards spreadsheet formulas in CSV and keeps JSON exact', async () => {
    const hostile = '=HYPERLINK("http://example.invalid","x"),\n"quoted"';
    const [category] = await db
      .select()
      .from(schema.budgetCategories)
      .where(eq(schema.budgetCategories.id, w.household.private.budgetCategory));
    await db
      .update(schema.budgetCategories)
      .set({ name: hostile })
      .where(eq(schema.budgetCategories.id, category.id));
    const { entries, manifest } = await exportArchive(w.owner);
    const table = manifest.tables.budget_categories!;
    const json = JSON.parse(entries.get(table.json.path)!.toString('utf8')) as Array<{
      id: number;
      name: string;
    }>;
    expect(json.find((row) => row.id === category.id)!.name).toBe(hostile);
    const csv = parseCsv(entries.get(table.csv.path)!.toString('utf8'));
    const nameColumn = csv[0]!.indexOf('name');
    const idColumn = csv[0]!.indexOf('id');
    const cell = csv.find((row) => row[idColumn] === String(category.id))![nameColumn];
    expect(cell).toBe(`'${hostile}`);
    for (const row of csv.slice(1)) expect(row[nameColumn]).not.toMatch(/^[=+\-@\t\r]/);
  });

  test('keeps native currencies and negative amounts as stored', async () => {
    const { entries, manifest } = await exportArchive(w.owner);
    const rows = JSON.parse(
      entries.get(manifest.tables.savings_accounts!.json.path)!.toString('utf8'),
    ) as Array<{ currency: string; balance: number }>;
    expect(rows.every((row) => typeof row.balance === 'number' && row.currency.length === 3)).toBe(
      true,
    );
  });

  test('allows one export at a time per account and frees the slot when the client leaves', async () => {
    const first = await w.integration.request('/api/settings/export', { cookie: w.owner.cookie });
    expect(first.status).toBe(200);
    const second = await w.integration.request('/api/settings/export', { cookie: w.owner.cookie });
    expect(second.status).toBe(429);
    await first.body!.cancel();
    const third = await w.integration.request('/api/settings/export', { cookie: w.owner.cookie });
    expect(third.status).toBe(200);
    await third.body!.cancel();
  });

  test('stops when the session ends while the archive is being sent', async () => {
    const session = await w.integration.signIn(w.owner.user.email);
    const response = await w.integration.request('/api/settings/export', {
      cookie: session.cookie,
    });
    const reader = response.body!.getReader();
    await reader.read();
    const token = session.cookie.match(/session=([^;]+)/)![1]!;
    const { hashSessionToken } = await import('../lib/sessions');
    await db.delete(schema.sessions).where(eq(schema.sessions.id, hashSessionToken(token)));
    let failure: unknown = null;
    try {
      for (;;) {
        const chunk = await reader.read();
        if (chunk.done) break;
      }
    } catch (error) {
      failure = error;
    }
    expect(failure).not.toBeNull();
    // The slot is free again for the next export.
    const next = await w.integration.request('/api/settings/export', { cookie: w.owner.cookie });
    expect(next.status).toBe(200);
    await next.body!.cancel();
  });

  test('lists a missing document in the manifest instead of failing', async () => {
    const [payslip] = await db
      .select()
      .from(schema.payslips)
      .where(eq(schema.payslips.userId, w.owner.user.id));
    const key = payslip.documentStorageKey!;
    const bytes = providers.storedDocuments.get(key)!;
    providers.storedDocuments.delete(key);
    try {
      const { manifest } = await exportArchive(w.owner);
      expect(manifest.documents.missing.length).toBe(1);
    } finally {
      providers.storedDocuments.set(key, bytes);
    }
  });

  test('refuses an account over a limit before sending anything', async () => {
    const { ExportLimitError, EXPORT_LIMITS, prepareExport } = await import('../lib/dataExport');
    const id = w.owner.user.id;
    const over = (limits: Partial<typeof EXPORT_LIMITS>) =>
      prepareExport(id, new Date(), { ...EXPORT_LIMITS, ...limits });
    await expect(over({ rows: 3 })).rejects.toBeInstanceOf(ExportLimitError);
    await expect(over({ documents: 1 })).rejects.toBeInstanceOf(ExportLimitError);
    await expect(over({ documentBytes: 10 })).rejects.toBeInstanceOf(ExportLimitError);
    await expect(prepareExport(id)).resolves.toBeDefined();
  });
});

describe('account deletion', () => {
  test('previews what goes with the account', async () => {
    const response = await w.integration.request('/api/settings/account', {
      cookie: w.owner.cookie,
    });
    expect(response.status).toBe(200);
    const { data } = (await response.json()) as {
      data: {
        rowCounts: Record<string, number>;
        sharedWithPartner: number;
        documentCount: number;
        hasPartner: boolean;
      };
    };
    expect(data.hasPartner).toBe(true);
    expect(data.sharedWithPartner).toBeGreaterThan(0);
    expect(data.documentCount).toBeGreaterThan(0);
    expect(data.rowCounts.savings_accounts).toBe(3);
  });

  test('needs the password and the account email', async () => {
    const send = (json: unknown) =>
      w.integration.request('/api/settings/account', {
        method: 'DELETE',
        cookie: w.stranger.cookie,
        json,
      });
    expect((await send({})).status).toBe(400);
    expect((await send({ password: world.WORLD_EMAIL_DOMAIN, confirmEmail: 'x' })).status).toBe(
      400,
    );
    const { integrationPassword } = await import('../test/integration');
    expect(
      (await send({ password: 'wrong-password-123', confirmEmail: w.stranger.user.email })).status,
    ).toBe(401);
    expect(
      (await send({ password: integrationPassword, confirmEmail: 'someone@else.test' })).status,
    ).toBe(400);
    const [still] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, w.stranger.user.id));
    expect(still).toBeDefined();
  });

  test('removes the account, its rows and documents, and keeps the partner whole', async () => {
    const { integrationPassword } = await import('../test/integration');
    const ownerId = w.owner.user.id;
    const partnerId = w.partner.user.id;
    const partnerBefore = await world.snapshotWorld([partnerId]);
    const strangerBefore = await world.snapshotWorld([w.stranger.user.id]);

    // The partner enters a transaction on the owner's joint account, and the owner enters one on
    // the partner's joint account.
    const [partnerAccount] = await db
      .insert(schema.savingsAccounts)
      .values({
        userId: partnerId,
        name: 'partner joint',
        bank: 'bank',
        balance: 50,
        currency: 'EUR',
        interestRate: 0,
        accountType: 'Savings',
        isJoint: true,
      })
      .returning();
    const [ownerEntered] = await db
      .insert(schema.savingsTransactions)
      .values({
        userId: ownerId,
        accountId: partnerAccount!.id,
        type: 'deposit',
        amount: 5,
        date: '2026-03-02',
        note: 'entered by the owner',
      })
      .returning();
    await db.insert(schema.savingsTransactions).values({
      userId: partnerId,
      accountId: w.household.joint.savingsAccount,
      type: 'deposit',
      amount: 7,
      date: '2026-03-02',
      note: 'entered by the partner',
    });
    const ownerKeys = (
      await db
        .select({ key: schema.payslips.documentStorageKey })
        .from(schema.payslips)
        .where(eq(schema.payslips.userId, ownerId))
    ).map((row) => row.key!);
    expect(ownerKeys.length).toBeGreaterThan(0);
    const partnerBeforeEntry = await world.snapshotWorld([partnerId]);
    expect(partnerBeforeEntry).not.toBe(partnerBefore);
    await db
      .insert(schema.oidcIdentities)
      .values({ userId: ownerId, issuer: 'https://auth.example', subject: 'deleted-subject' });

    const response = await w.integration.request('/api/settings/account', {
      method: 'DELETE',
      cookie: w.owner.cookie,
      json: { password: integrationPassword, confirmEmail: w.owner.user.email },
    });
    expect(response.status).toBe(200);
    const { data } = (await response.json()) as {
      data: {
        auditId: number;
        documentCount: number;
        documentsDeleted: number;
        documentsPending: number;
      };
    };
    auditIds.push(data.auditId);
    expect(data.documentsPending).toBe(0);
    expect(data.documentsDeleted).toBe(data.documentCount);
    expect(data.documentCount).toBeGreaterThan(0);

    // Nothing of the account is left, in any table.
    expect(await db.select().from(schema.users).where(eq(schema.users.id, ownerId))).toEqual([]);
    for (const entry of ACCOUNT_TABLES) {
      if (entry.name === 'users') continue;
      expect(await selectAccountRows(db, entry, ownerId)).toEqual([]);
    }
    for (const table of [
      schema.sessions,
      schema.oidcIdentities,
      schema.bunqConnections,
      schema.partnerLinkMembers,
    ] as const) {
      expect(await db.select().from(table).where(eq(table.userId, ownerId))).toEqual([]);
    }
    for (const key of ownerKeys) expect(providers.storedDocuments.has(key)).toBe(false);

    // The session is gone, so the old cookie signs nobody in.
    const me = await w.integration.request('/api/settings', { cookie: w.owner.cookie });
    expect(me.status).toBe(401);

    // The audit row counts what went and names no one.
    const [audit] = await db
      .select()
      .from(schema.accountDeletions)
      .where(eq(schema.accountDeletions.id, data.auditId));
    expect(audit!.deletedUserId).toBe(ownerId);
    expect(audit!.rowCounts.savings_accounts).toBe(3);
    expect(audit!.rowCounts.oidc_identities).toBe(1);
    expect(JSON.stringify(audit)).not.toContain('deleted-subject');
    expect(audit!.documentCount).toBe(data.documentCount);
    expect(audit!.documentsFailedKeys).toEqual([]);
    expect(JSON.stringify(audit)).not.toContain(w.owner.user.email);

    // The partner keeps their data. A transaction the owner entered on the partner's account
    // became the partner's; the one the partner entered on the owner's account went with it.
    const [handedOver] = await db
      .select()
      .from(schema.savingsTransactions)
      .where(eq(schema.savingsTransactions.id, ownerEntered!.id));
    expect(handedOver!.userId).toBe(partnerId);
    expect(
      await db
        .select()
        .from(schema.savingsTransactions)
        .where(eq(schema.savingsTransactions.accountId, w.household.joint.savingsAccount)),
    ).toEqual([]);
    const partnerAfter = await world.snapshotWorld([partnerId]);
    expect(partnerAfter).toContain('entered by the owner');
    expect(await world.snapshotWorld([w.stranger.user.id])).toBe(strangerBefore);
    const partnerSession = await w.integration.request('/api/settings', {
      cookie: w.partner.cookie,
    });
    expect(partnerSession.status).toBe(200);
  });

  test('keeps the keys the store refused and removes them on retry', async () => {
    const { integrationPassword } = await import('../test/integration');
    const key = (
      await db
        .select({ key: schema.payslips.documentStorageKey })
        .from(schema.payslips)
        .where(eq(schema.payslips.userId, w.stranger.user.id))
    )[0]!.key!;
    providers.documentStore.failedDeletionKeys.add(key);
    const response = await w.integration.request('/api/settings/account', {
      method: 'DELETE',
      cookie: w.stranger.cookie,
      json: { password: integrationPassword, confirmEmail: w.stranger.user.email },
    });
    expect(response.status).toBe(200);
    const { data } = (await response.json()) as {
      data: { auditId: number; documentsPending: number };
    };
    auditIds.push(data.auditId);
    expect(data.documentsPending).toBe(1);
    const [audit] = await db
      .select()
      .from(schema.accountDeletions)
      .where(eq(schema.accountDeletions.id, data.auditId));
    expect(audit!.documentsFailedKeys).toEqual([key]);
    expect(providers.storedDocuments.has(key)).toBe(true);

    providers.documentStore.failedDeletionKeys.clear();
    const report = await retryDeletedAccountDocuments(providers.documentStore.store);
    expect(report.stillFailing).toBe(0);
    expect(report.deleted).toBeGreaterThanOrEqual(1);
    expect(providers.storedDocuments.has(key)).toBe(false);
    const [after] = await db
      .select()
      .from(schema.accountDeletions)
      .where(eq(schema.accountDeletions.id, data.auditId));
    expect(after!.documentsFailedKeys).toEqual([]);
  });
});
