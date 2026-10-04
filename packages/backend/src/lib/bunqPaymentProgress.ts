import { and, eq } from 'drizzle-orm';
import { db } from '../db/client';
import { bunqPaymentProgress } from '../db/schema';
import { BUNQ_PAYMENT_PAGE_CAP, fetchPayments, type BunqPayment } from './bunqClient';

type ImportIssue = { accountId?: number; message: string };
type BatchInput<T extends ImportIssue> = {
  userId: number;
  accountId: number;
  kind: 'savings' | 'budget';
  sessionToken: string;
  bunqUserId: string;
  newerThan: string | undefined;
  lastSyncAt: Date | null;
  importPayments: (payments: BunqPayment[]) => Promise<T[]>;
};

// Bunq pages newest to oldest. Keep the older-page URL durable; advancing a
// timestamp from a partial batch would permanently skip the remaining history.
export async function syncPaymentBatch<T extends ImportIssue>(input: BatchInput<T>) {
  const key = and(
    eq(bunqPaymentProgress.userId, input.userId),
    eq(bunqPaymentProgress.accountId, input.accountId),
    eq(bunqPaymentProgress.kind, input.kind),
  );
  const [saved] = await db.select().from(bunqPaymentProgress).where(key);
  const progress = resumeProgress(saved, input);
  if (progress.complete) return { issues: [] as ImportIssue[], syncedAt: progress.startedAt };
  // Save the boundary before fetching; crashes replay the batch idempotently.
  await db
    .insert(bunqPaymentProgress)
    .values({
      userId: input.userId,
      accountId: input.accountId,
      kind: input.kind,
      ...progress,
      id: undefined,
    })
    .onConflictDoUpdate({
      target: [bunqPaymentProgress.userId, bunqPaymentProgress.accountId, bunqPaymentProgress.kind],
      set: {
        newerThan: progress.newerThan,
        nextPageUrl: progress.nextPageUrl,
        complete: false,
        startedAt: progress.startedAt,
      },
    });
  let nextPageUrl = progress.nextPageUrl;
  for (let page = 0; page < BUNQ_PAYMENT_PAGE_CAP; page += 1) {
    const batch = await fetchPayments(
      input.sessionToken,
      input.bunqUserId,
      input.accountId,
      progress.newerThan ?? undefined,
      nextPageUrl ?? undefined,
      1,
    );
    const issues: ImportIssue[] = await input.importPayments(batch.payments);
    if (issues.length > 0) return { issues, syncedAt: progress.startedAt };
    nextPageUrl = batch.nextPageUrl;
    // Commit only after the whole page imports. A deadline or crash on the
    // next page resumes here rather than replaying the whole 100-page batch.
    await db
      .update(bunqPaymentProgress)
      .set({
        nextPageUrl,
        complete: nextPageUrl === null,
      })
      .where(key);
    if (!nextPageUrl) return { issues: [] as ImportIssue[], syncedAt: progress.startedAt };
  }
  return {
    issues: [{ accountId: input.accountId, message: 'Payment history continues on the next sync' }],
    syncedAt: progress.startedAt,
  };
}

function resumeProgress(
  saved: typeof bunqPaymentProgress.$inferSelect | undefined,
  input: { newerThan: string | undefined; lastSyncAt: Date | null },
) {
  if (saved && (!saved.complete || !input.lastSyncAt || input.lastSyncAt < saved.startedAt))
    return saved;
  return {
    newerThan: input.newerThan ?? null,
    nextPageUrl: null,
    complete: false,
    startedAt: new Date(),
  };
}
