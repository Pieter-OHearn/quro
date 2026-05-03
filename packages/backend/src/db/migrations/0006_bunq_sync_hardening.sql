ALTER TABLE "bunq_connections" ADD COLUMN "session_id" integer;
--> statement-breakpoint
WITH duplicate_categories AS (
  SELECT
    id,
    MIN(id) OVER (PARTITION BY user_id, month, year, name) AS keeper_id
  FROM budget_categories
),
category_rewrites AS (
  UPDATE budget_transactions bt
  SET category_id = dc.keeper_id
  FROM duplicate_categories dc
  WHERE bt.category_id = dc.id
    AND dc.id <> dc.keeper_id
  RETURNING bt.id
)
DELETE FROM budget_categories bc
USING duplicate_categories dc
WHERE bc.id = dc.id
  AND dc.id <> dc.keeper_id;
--> statement-breakpoint
UPDATE budget_categories bc
SET spent = COALESCE(totals.spent, 0)
FROM (
  SELECT
    bc_inner.id,
    COALESCE(SUM(bt.amount), 0)::numeric(19, 2) AS spent
  FROM budget_categories bc_inner
  LEFT JOIN budget_transactions bt ON bt.category_id = bc_inner.id
  GROUP BY bc_inner.id
) totals
WHERE bc.id = totals.id;
--> statement-breakpoint
WITH duplicate_connections AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY user_id
      ORDER BY
        COALESCE(last_sync_at, created_at) DESC,
        id DESC
    ) AS duplicate_rank
  FROM bunq_connections
)
DELETE FROM bunq_connections bc
USING duplicate_connections dc
WHERE bc.id = dc.id
  AND dc.duplicate_rank > 1;
--> statement-breakpoint
CREATE UNIQUE INDEX "budget_categories_user_month_name_unique" ON "budget_categories" USING btree ("user_id","month","year","name");
--> statement-breakpoint
DROP INDEX IF EXISTS "bunq_connections_user_id_idx";
--> statement-breakpoint
CREATE UNIQUE INDEX "bunq_connections_user_id_idx" ON "bunq_connections" USING btree ("user_id");
