import { expect, test } from 'bun:test';
import { sql } from 'drizzle-orm';
import { db } from './client';

const MIGRATION = new URL('./migrations/0044_oidc_sign_in.sql', import.meta.url);

class Rollback extends Error {}

const DIGEST = 'a'.repeat(64);

// The migration only adds two tables, so the accounts and sessions of an instance that upgrades
// must come through untouched and without a sign-in link, and the new tables must refuse what
// the sign-in code relies on them to refuse. It runs in a scratch schema inside a transaction
// that is rolled back; the foreign key still points at the real `users` table.
test('the migration leaves accounts and sessions as they were and adds the sign-in tables', async () => {
  await db
    .transaction(async (tx) => {
      await tx.execute(sql.raw('CREATE SCHEMA oidc_migration_test'));
      await tx.execute(sql.raw('SET LOCAL search_path = oidc_migration_test, public'));
      const inserted = await tx.execute(
        sql.raw(`
          INSERT INTO public.users (first_name, last_name, email, password_hash) VALUES
            ('Ada', 'Example', 'ada@oidc-migration.test', 'hash-1'),
            ('Bo', 'Example', 'bo@oidc-migration.test', 'hash-2')
          RETURNING id
        `),
      );
      const [ada, bo] = inserted.map((row) => Number(row.id));
      await tx.execute(
        sql.raw(`
          INSERT INTO public.sessions (id, user_id, expires_at) VALUES
            ('${DIGEST}', ${ada}, now() + interval '1 day')
        `),
      );
      const before = await tx.execute(
        sql.raw(
          "SELECT id, email, password_hash FROM public.users WHERE email LIKE '%@oidc-migration.test' ORDER BY id",
        ),
      );

      const migration = await Bun.file(MIGRATION).text();
      for (const statement of migration.split('--> statement-breakpoint')) {
        await tx.execute(sql.raw(statement));
      }

      const after = await tx.execute(
        sql.raw(
          "SELECT id, email, password_hash FROM public.users WHERE email LIKE '%@oidc-migration.test' ORDER BY id",
        ),
      );
      expect(after).toEqual(before);
      const sessionRows = await tx.execute(
        sql.raw(`SELECT id FROM public.sessions WHERE user_id = ${ada}`),
      );
      expect(sessionRows.map((row) => row.id)).toEqual([DIGEST]);
      const links = await tx.execute(sql.raw('SELECT count(*)::int AS n FROM oidc_identities'));
      expect(links[0]!.n).toBe(0);

      // One identity per issuer and subject, and one per account and issuer.
      const link = (user: number, subject: string, issuer = 'https://auth.example') =>
        tx.execute(
          sql.raw(
            `INSERT INTO oidc_identities (user_id, issuer, subject) VALUES (${user}, '${issuer}', '${subject}')`,
          ),
        );
      await link(ada!, 'sub-1');
      await expect(
        tx.transaction((inner) =>
          inner.execute(
            sql.raw(
              `INSERT INTO oidc_identities (user_id, issuer, subject) VALUES (${bo}, 'https://auth.example', 'sub-1')`,
            ),
          ),
        ),
      ).rejects.toThrow();
      await expect(
        tx.transaction((inner) =>
          inner.execute(
            sql.raw(
              `INSERT INTO oidc_identities (user_id, issuer, subject) VALUES (${ada}, 'https://auth.example', 'sub-2')`,
            ),
          ),
        ),
      ).rejects.toThrow();
      await link(ada!, 'sub-1', 'https://other.example');

      // An attempt is keyed by a digest, never by a raw token.
      const attempt = (id: string) =>
        tx.transaction((inner) =>
          inner.execute(
            sql.raw(
              `INSERT INTO oidc_login_attempts (id, state, nonce, code_verifier, expires_at) VALUES ('${id}', 's', 'n', 'v', now())`,
            ),
          ),
        );
      await attempt(DIGEST);
      await expect(attempt('not-a-digest')).rejects.toThrow();
      await expect(attempt('A'.repeat(64))).rejects.toThrow();

      // Deleting an account removes its links.
      await tx.execute(sql.raw(`DELETE FROM public.users WHERE id = ${ada}`));
      const remaining = await tx.execute(sql.raw('SELECT count(*)::int AS n FROM oidc_identities'));
      expect(remaining[0]!.n).toBe(0);
      throw new Rollback();
    })
    .catch((error: unknown) => {
      if (!(error instanceof Rollback)) throw error;
    });
});
